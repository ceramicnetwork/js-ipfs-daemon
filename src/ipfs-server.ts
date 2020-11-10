import IPFS from 'ipfs'
import { IPFSApi } from "./declarations"

import HttpApi from 'ipfs-http-server'
import HttpGateway from 'ipfs-http-gateway'

import dagJose from 'dag-jose'
// @ts-ignore
import multiformats from 'multiformats/basics'
// @ts-ignore
import legacy from 'multiformats/legacy'

import { createRepo } from 'datastore-s3'
import HealthcheckServer from "./healthcheck-server"
import { toBoolean } from "./utils"

const IPFS_PATH = process.env.IPFS_PATH || 'ipfs'
const IPFS_S3_REPO_ENABLED = 'IPFS_S3_REPO_ENABLED' in process.env? toBoolean(process.env.IPFS_S3_REPO_ENABLED) : false

const { AWS_BUCKET_NAME } = process.env
const { AWS_ACCESS_KEY_ID } = process.env
const { AWS_SECRET_ACCESS_KEY } = process.env

const IPFS_SWARM_TCP_PORT = process.env.IPFS_SWARM_TCP_PORT || 4011
const IPFS_SWARM_WS_PORT = process.env.IPFS_SWARM_WS_PORT || 4012

const IPFS_API_PORT = process.env.IPFS_API_PORT || 5011
const IPFS_GATEWAY_PORT = process.env.IPFS_GATEWAY_PORT || 9011
const IPFS_GATEWAY_ONLY = toBoolean(process.env.IPFS_GATEWAY_ONLY) || false

const IPFS_DHT_SERVER_MODE = process.env.IPFS_DHT_SERVER_MODE === 'true'

export default class IPFSServer {

    /**
     * Start js-ipfs instance with dag-jose enabled
     */
    static async start(): Promise<void> {
        const repo = IPFS_S3_REPO_ENABLED ? createRepo({
            path: IPFS_PATH,
        }, {
            bucket: AWS_BUCKET_NAME,
            accessKeyId: AWS_ACCESS_KEY_ID,
            secretAccessKey: AWS_SECRET_ACCESS_KEY,
        }) : null

        // setup dag-jose codec
        multiformats.multicodec.add(dagJose)
        const format = legacy(multiformats, dagJose.name)

        const ipfs: IPFSApi = await IPFS.create({
            repo,
            ipld: { formats: [format] },
            libp2p: {
                config: {
                    dht: {
                        enabled: true,
                        clientMode: !IPFS_DHT_SERVER_MODE,
                        randomWalk: true,
                    },
                },
            },
            config: {
                Addresses: {
                    Swarm: [
                        `/ip4/0.0.0.0/tcp/${IPFS_SWARM_TCP_PORT}`,
                        `/ip4/0.0.0.0/tcp/${IPFS_SWARM_WS_PORT}/ws`,
                    ],
                    API: `/ip4/0.0.0.0/tcp/${IPFS_API_PORT}`,
                    Gateway: `/ip4/0.0.0.0/tcp/${IPFS_GATEWAY_PORT}`,
                },
                Routing: {
                    Type: IPFS_DHT_SERVER_MODE ? 'dhtserver' : 'dhtclient',
                },
            },
        })

        if (!IPFS_GATEWAY_ONLY) {
          await new HttpApi(ipfs).start()
          console.log('IPFS API server listening on ' + IPFS_API_PORT)
        }
        await new HttpGateway(ipfs).start()
        console.log('IPFS Gateway server listening on ' + IPFS_GATEWAY_PORT)

        HealthcheckServer.start(ipfs)
    }
}
