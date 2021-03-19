var signAlgorithm = {
    // name: "RSASSA-PKCS1-v1_5",
    name: "RSA-PSS",
    saltLength: 32,
    hash: {
        name: "SHA-256"
    },
    modulusLength: 2048,
    extractable: true,
    publicExponent: new Uint8Array([1, 0, 1])
}
var scopeSign = ["sign", "verify"]

function generateKey() {
    return crypto.subtle.generateKey(signAlgorithm, true, scopeSign)
}

async function getSignature(privkeyb64, data) {
    privkeyArrayBuffer = base64StringToArrayBuffer(privkeyb64)
    console.log("got this many bytes of pk decoded array buffer:", privkeyArrayBuffer.byteLength)
    // dataToSign = stringToArrayBuffer(data)
    dataToSign = new Uint8Array(data.toByteArray())
    console.log("got this many bytes of input, and after convert to arraybuffer for sig it is this long", data.length, dataToSign.byteLength)
    privkeyreused = await crypto.subtle.importKey("pkcs8", privkeyArrayBuffer, signAlgorithm, true, ["sign"])
    siggy = await window.crypto.subtle.sign(signAlgorithm, privkeyreused, dataToSign)
    console.log("siggy type,", typeof(siggy))
    console.log("siggy length ????", siggy.byteLength)
    siggyB64 = arrayBufferToBase64String(siggy)
    console.log("siggyb64 ????", siggyB64)
    return siggyB64
}

async function verifySignature(pubkeyb64, data) {
    // privkeyArrayBuffer = base64StringToArrayBuffer(privkeyb64)
    // console.log("got this many bytes of pk decoded array buffer:", privkeyArrayBuffer.byteLength)
    // dataToSign = stringToArrayBuffer(data)
    // console.log("got this many bytes of input, and after convert to arraybuffer for sig it is this long", data.length, dataToSign.byteLength)
    // privkeyreused = await crypto.subtle.importKey("pkcs8", privkeyArrayBuffer, signAlgorithm, true, ["sign"])
    // siggy = await window.crypto.subtle.sign(signAlgorithm, privkeyreused, dataToSign)
    // console.log("siggy type,", typeof(siggy))
    // console.log("siggy length ????", siggy.byteLength)
    // siggyB64 = arrayBufferToBase64String(siggy)
    // console.log("siggyb64 ????", siggyB64)
    // return siggyB64
    return false
}

async function verifyProfileSig(data, pubkey) {
    console.log("verifyProfileSig to check data like", data)

    let sigb64 =  data["Signature"]
    data["Signature"] = null

    let dataToVerify = stableJson(data, function(a, b){
        return keyOrder["Profile"][a.key] > keyOrder["Profile"][b.key] ? 1 : -1;
    })
    data["Signature"] = sigb64
    console.log("dataToVerify", dataToVerify)

    let verified = false
    let sigBytes = base64StringToArrayBuffer(sigb64)
    try {
        // console.log(sigBytes, dataToVerify)
        verified = await crypto.subtle.verify(signAlgorithm, pubkey, sigBytes, new Uint8Array(dataToVerify.toByteArray()));
    } catch(e) {
        console.log("verifySig got verify err", e)
    }
    return verified
}

async function verifyGraphNodeSig(data, pubkey) {
    console.log("verifyGraphNodeSig to check data like", data)
    let sigb64 =  data["Signature"]
    data["Signature"] = null

    let dataToVerify = stableJson(data, function(a, b){
        return keyOrder["GraphNode"][a.key] > keyOrder["GraphNode"][b.key] ? 1 : -1;
    })
    data["Signature"] = sigb64
    console.log("verifyGraphNodeSig dataToVerify", dataToVerify)

    let verified = false
    let sigBytes = base64StringToArrayBuffer(sigb64)
    try {
        // console.log(sigBytes, dataToVerify)
        verified = await crypto.subtle.verify(signAlgorithm, pubkey, sigBytes, new Uint8Array(dataToVerify.toByteArray()));
    } catch(e) {
        console.log("verifySig got verify err", e)
    }
    return verified

}

//http://www.thesharepoint.nl/pb/javascript/utf-16-string-tobytearray-in-javascript/
String.prototype.toByteArray=String.prototype.toByteArray||(function(e){for(var b=[],c=0,f=this.length;c<f;c++){var a=this.charCodeAt(c);if(55296<=a&&57343>=a&&c+1<f&&!(a&1024)){var d=this.charCodeAt(c+1);55296<=d&&57343>=d&&d&1024&&(a=65536+(a-55296<<10)+(d-56320),c++)}128>a?b.push(a):2048>a?b.push(192|a>>6,128|a&63):65536>a?(55296<=a&&57343>=a&&(a=e?65534:65533),b.push(224|a>>12,128|a>>6&63,128|a&63)):1114111<a?b.push(239,191,191^(e?1:2)):b.push(240|a>>18,128|a>>12&63,128|a>>6&63,128|a&63)}return b})

function stringToArrayBuffer(byteStr) {
    var bytes = new Uint8Array(byteStr.length)
    for (var i = 0; i < byteStr.length; i++) {
        bytes[i] = byteStr.charCodeAt(i)
    }
    return bytes.buffer
}

function base64StringToArrayBuffer(b64str) {
    var byteStr = atob(b64str)
    return stringToArrayBuffer(byteStr)
}

function arrayBufferToString(arrayBuffer) {
    var byteArray = new Uint8Array(arrayBuffer)
    var byteString = ''
    for (var i=0; i<byteArray.byteLength; i++) {
        byteString += String.fromCharCode(byteArray[i])
    }
    return byteString
}

function arrayBufferToBase64String(arrayBuffer) {
    return btoa(arrayBufferToString(arrayBuffer))
}

async function derivePubkeyFromPrivkey(privkeyB64) {
    //experiment to figure out how we can get pubkey from privkey in JS, leadup to being able to import an identity
    // ident = identities[selectedIdentity]
    // privkey = await window.crypto.subtle.importKey('pkcs8', base64StringToArrayBuffer(ident["priv"]), signAlgorithm, true, ["sign"])
    privkey = await window.crypto.subtle.importKey('pkcs8', base64StringToArrayBuffer(privkeyB64), signAlgorithm, true, ["sign"])

    // https://stackoverflow.com/a/57571350 (Generate Public key from Private Key using WebCrypto API)
    intermediaryJwk = await crypto.subtle.exportKey("jwk", privkey);

    // remove private data from JWK
    delete intermediaryJwk.d;
    delete intermediaryJwk.dp;
    delete intermediaryJwk.dq;
    delete intermediaryJwk.q;
    delete intermediaryJwk.qi;
    intermediaryJwk.key_ops = ["verify"]
    pubkey = await crypto.subtle.importKey("jwk", intermediaryJwk, signAlgorithm, true, ["verify"])
    console.log("ajwk", intermediaryJwk)
    pubExportedBytes = await window.crypto.subtle.exportKey('spki', pubkey)
    pubExportedB64 = arrayBufferToBase64String(pubExportedBytes)

    // result = pubExportedB64 == ident["pub"]
    //should log true.
    // console.log(result)
    // console.log(pubExportedB64)
    return pubExportedB64
}

let importedKeys = {}
function getPubkeyForProfileId(profileId) {
    if (!importedKeys[profileId]) {
        return null
    }
    return importedKeys[profileId]
}
async function importProfilePubkey(profileId, pubkeyB64) {
    alreadyImported = getPubkeyForProfileId(profileId)
    if (alreadyImported) {
        return alreadyImported
    }
    try {
        console.log("decode and import this:", pubkeyB64)
        let arraybuf = base64StringToArrayBuffer(pubkeyB64)
        pubkey = await crypto.subtle.importKey("spki", arraybuf, signAlgorithm, true, ["verify"])
        importedKeys[profileId] = pubkey
        return pubkey
    } catch (e) {
        console.log("importProfilePubkey got importKey error", e)
        return null
    }
}
