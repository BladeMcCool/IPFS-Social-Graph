const rsaClass = require('libp2p-crypto/src/keys/rsa-class')
const PeerId = require('peer-id')
async function getpeerIdFromExportedPubkeyB64(b64in) {
    pubkey = rsaClass.unmarshalRsaPublicKey(Buffer.from(b64in, 'base64'))
    peeridObj = await PeerId.createFromPubKey(pubkey.bytes)
    peerId = peeridObj.toB58String()
    return peerId
}
module.exports.peerid = getpeerIdFromExportedPubkeyB64
