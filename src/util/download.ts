import * as fs from 'fs-extra';
import got, { OptionsOfTextResponseBody } from 'got';
import { promisify } from 'util';
import stream = require('stream');
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';

const httpProxyAgent = !process.env.HTTP_PROXY ? undefined : new HttpProxyAgent({
    proxy: process.env.HTTP_PROXY
});

const httpsProxyAgent = !process.env.HTTPS_PROXY ? undefined : new HttpsProxyAgent({
    proxy: process.env.HTTPS_PROXY
});

const options: OptionsOfTextResponseBody & { isStream?: undefined } = {
    headers: {
        'user-agent': 'nodejs'
    },
    agent: {
        http: httpProxyAgent,
        https: httpsProxyAgent
    },
    timeout: {
        request: 60 * 1000,
        lookup: 500
    }
}

export class Download {
    static async getText(uri: string): Promise<string> {
        const body = await got(uri, options).text();
        return JSON.parse(body as string)
    }

    static async getFile(uri: string, destination: string, progress = false): Promise<void> {
        let lastTick = 0;
        const dlStream = got.stream(uri, options);
        if (progress) {
            dlStream.on('downloadProgress', ({ transferred, total, percent }) => {
                const currentTime = Date.now();
                if (total > 0 && (lastTick === 0 || transferred === total || currentTime - lastTick >= 2000)) {
                    console.log(`progress: ${transferred}/${total} (${Math.floor(100 * percent)}%)`);
                    lastTick = currentTime;
                }
            });
        }
        const writeStream = fs.createWriteStream(destination);

        return await promisify(stream.pipeline)(dlStream, writeStream);
    }
}