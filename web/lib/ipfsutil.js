// caller should do
// <script src="./ipfs.bundle.js"></script>
const uint8ArrayConcat = require('uint8arrays/concat')
const IPFS = require("ipfs")

const stableJson = require('fast-json-stable-stringify')
let ipfsStarted = false
let ipfs
// window.addEventListener('DOMContentLoaded', startIpfs, false);
async function startIpfs() {
    const options = {
        start: true,
        silent: true,
        // preload: { enabled: false } // <-- turning this off i think will reduce the network spam but i think what its doing is probably beneficial for the data availability in the network.
    }
    ipfs = await IPFS.create(options)
    ipfsStarted = true

    console.log("startIpfs completed")

    // return ipfs
}

async function getCidContentsByCat(cid, bubbleError) {
    let chunknum = 0
    const chunks = []
    let catopts = {
        timeout: 45000
    }
    try {
        for await (const chunk of ipfs.cat(cid, catopts)) {
            chunknum++
            // console.log(chunknum, chunk)
            chunks.push(chunk)
        }
    } catch(e) {
        if (e.message == 'request timed out') {
            if (bubbleError) {
                throw e
            }
            console.log("getCidContentsByCat timeout trying to get ", cid)
        } else {
            console.log("getCidContentsByCat error: ", e)
        }
    }
    // console.log('Obtained file contents:', arrayBufferToString(uint8ArrayConcat(chunks)))
    return arrayBufferToString(uint8ArrayConcat(chunks))
}

async function getCidContentsStringByCat(cid, bubbleError) {
    let chunknum = 0
    let catopts = {
        timeout: 45000
    }
    let data = ""
    try {
        for await (const chunk of ipfs.cat(cid, catopts)) {
            chunknum++
            data += chunk.toString()
        }
    } catch(e) {
        if (e.message == 'request timed out') {
            if (bubbleError) {
                throw e
            }
            console.log("getCidContentsStringByCat timeout trying to get ", cid)
        } else {
            console.log("getCidContentsStringByCat error: ", e)
        }
    }
    return data
}

async function getCidContentsByGet(cid) {
    for await (const file of ipfs.get(cid)) {
        console.log(file.type, file.path)
        if (!file.content) {
            console.log("no content here!!")
            continue;
        }

        const chunks = []
        for await (const chunk of file.content) {
            chunks.push(chunk)
        }
        return uint8ArrayConcat(chunks)
    }
}

async function addContentsToIPFS(contents) {
    cidInfo = await ipfs.add(contents)
    // console.log(cidInfo)
    // console.log(cidInfo.cid)
    // console.log(cidInfo.cid.string)
    return cidInfo.cid.string
}
