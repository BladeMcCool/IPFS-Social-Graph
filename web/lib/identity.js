async function setIdentity(keyname) {
    if (!keyname) {
        console.log("setIdentity: there is no keyname given to switch to the identity of")
        // unselectIdentity()
        return
    }
    if (!identities) {
        console.log("setIdentity: cannot set identity - no identities exist.")
        return
    }
    console.log("setIdentity", keyname)
    selectedIdentity = keyname
    selectBox = document.getElementById("chooseident")
    if (selectBox.value != keyname) {
        for (k = 0; k < selectBox.options.length; k++) {
            option = selectBox.options[k]
            if (option.value == keyname) {
                selectBox.selectedIndex = option.index
                break
            }
        }
    }

    //TODO restore the other identity fields here
    displayTimelineTexts("[]")
    identity = identities[selectedIdentity]

    pubTextarea = document.getElementById("pubkeyb64")
    pubTextarea.innerHTML = identity["pub"]
    privTextarea = document.getElementById("privkeyb64")
    privTextarea.innerHTML = identity["priv"]

    if (!identity["profileid"]) {
        // console.log("setIdentity, no profileId set, let us get the server to interpret our pubkey for us") //since trying to figure it out in JS right now is a waste of time and not 'easy' and likely involves at least 3 extenal libraries (something for x509/asn.1 der decode/extract of pk bytes which i failed to figure out, plus multihash and base58, the latter of which i had some luck finding workable implementations.)
        // identity["profileid"] = await makeRequest("GET", serviceBaseUrl + "/peerId")
        // console.log("got profileId from server: ", identity["profileid"])
        console.log("figure out profileId")
        identity["profileid"] = await peerutil.peerid(identity["pub"])
    }

    document.getElementById("dispname").value = identity["dispname"] ? identity["dispname"] : ""
    document.getElementById("bio").value = identity["bio"] ? identity["bio"] : ""
    document.getElementById("profileid").value = identity["profileid"] ? identity["profileid"] : ""
    document.getElementById("ipnsdelegate").value = identity["ipnsdelegate"] ? identity["ipnsdelegate"] : ""
    document.getElementById("profiletip").value = identity["profiletip"] ? identity["profiletip"] : ""
    document.getElementById("graphtip").value = identity["graphtip"] ? identity["graphtip"] : ""
    document.getElementById("sendprivkey").checked = identity["sendprivkey"] ? identity["sendprivkey"] : false

    document.getElementById("posttext").value = ""
    document.getElementById("inreplyto").value = ""
    focusPostText()

    latestTimelineTextsJson = await getLatestTimelineTexts(identity["pub"], identity["profiletip"])
    console.log(latestTimelineTextsJson)
    displayTimelineTexts(latestTimelineTextsJson)
    try {
        await localforage.setItem('selectedIdentity', keyname);
        console.log("updated selectedIdentity indexeddb");
    } catch (err) {
        console.log("failed to set selectedIdentity indexeddb ??", err);
    }
}

async function newIdentity() {
    console.log('newIdentity: identities is: ', identities);
    newidentname = document.getElementById("newidentname").value.trim()
    if (!newidentname) {
        alert("Please type a name for it")
        console.log("not creating identity with no name")
        return
    }
    if (identities[newidentname]) {
        alert("Name already in use, choose something else or delete it first.")
        console.log("not overwriting existing identity named", newidentname)
        return
    }
    keypair = await generateKey()
    console.log("keypair", keypair)
    spki = await window.crypto.subtle.exportKey('spki', keypair.publicKey)
    console.log(spki)
    spkib64 = arrayBufferToBase64String(spki)
    console.log("pubkey b64 in PKIX", spkib64)
    console.log("\n\n")
    pkcs8 = await window.crypto.subtle.exportKey('pkcs8', keypair.privateKey)
    pkcs8b64 = arrayBufferToBase64String(pkcs8)
    console.log("privkey b64 in pkcs8", pkcs8b64)

    newIdentitySettings = {
        "pub":spkib64,
        "priv":pkcs8b64,
        "dispname":"",
        "bio":"",
        "graphtip":"",
        "profiletip":"",
        "profileid":"",
        "ipnsdelegate":"",
    }

    identities[newidentname] = newIdentitySettings
    addIdentityToChoices(newidentname)
    scrapeSettingsIntoSelectedIdentity() //so that when we updateSavedIdentites we keep whatever was in the fields.
    await setIdentity(newidentname)
    await updateSavedIdentites(identities)
    clearIdentName()
}

function addIdentityToChoices(keyname) {
    select = document.getElementById('chooseident');
    var opt = document.createElement('option');
    opt.value = keyname;
    opt.innerHTML = keyname;
    select.appendChild(opt);
}

function removeSelectedIdentFromSelect(confirmRemoval){
    selectBox = document.getElementById("chooseident")
    if (!selectBox.value) {
        return
    }
    console.log("delete for", selectBox.value)
    if (confirmRemoval && !confirm("for real? can't be undone.")) {
        return
    }
    removeIdentname = selectBox.value
    console.log("do it to", removeIdentname)
    selectBox.remove(selectBox.selectedIndex)

    selectBox.selectedIndex = 0

}

async function deleteSelectedIdentity() {
    removeSelectedIdentFromSelect(true)
    delete identities[removeIdentname]
    await updateSavedIdentites(identities)
    unselectIdentity()
}

function scrapeSettingsIntoSelectedIdentity() {
    if (!selectedIdentity) {
        console.log("scrapeSettingsIntoSelectedIdentity: no currently selected identity, not doing anything.")
        return
    }
    identity = identities[selectedIdentity]
    identity["dispname"] = document.getElementById("dispname").value
    identity["bio"] = document.getElementById("bio").value
    identity["graphtip"] = document.getElementById("graphtip").value
    identity["profiletip"] = document.getElementById("profiletip").value
    identity["profileid"] = document.getElementById("profileid").value
    identity["ipnsdelegate"] = document.getElementById("ipnsdelegate").value
    identity["sendprivkey"] = document.getElementById("sendprivkey").checked
}

function unselectIdentity() {
    selectedIdentity = null
    document.getElementById("dispname").value = ""
    document.getElementById("bio").value = ""
    document.getElementById("graphtip").value = ""
    document.getElementById("profileid").value = ""
    document.getElementById("ipnsdelegate").value = ""
    document.getElementById("profiletip").value = ""
    document.getElementById("sendprivkey").checked = false
    document.getElementById("posttext").value = ""
    document.getElementById("inreplyto").value = ""
    document.getElementById("followprofileid").value = ""
    document.getElementById("pubkeyb64").innerHTML = ""
    document.getElementById("privkeyb64").innerHTML = ""
    displayTimelineTexts("[]")
}

async function renameSelectedIdentity() {
    console.log('newIdentity: identities is: ', identities);
    newidentname = document.getElementById("newidentname").value.trim()
    if (!newidentname) {
        alert("Please type a name for it")
        console.log("cannot rename to nothing")
        return
    }
    if (identities[newidentname]) {
        alert("Name already in use, choose something else or delete it first.")
        console.log("not overwriting existing identity named", newidentname)
        return
    }

    identities[newidentname] = identities[selectedIdentity]
    delete identities[selectedIdentity]
    selectedIdentity = newidentname

    removeSelectedIdentFromSelect(false)
    addIdentityToChoices(newidentname)
    scrapeSettingsIntoSelectedIdentity() //so that when we updateSavedIdentites we keep whatever was in the fields.
    await setIdentity(newidentname)
    await updateSavedIdentites(identities)
    clearIdentName()
}

async function chooseIdentity(keyname) {
    await cancelCurrentHistoryRequest()
    scrapeSettingsIntoSelectedIdentity()
    if (!keyname) {
        console.log("choose with no keyname , should wipe stuff")
        unselectIdentity()
    } else {
        await setIdentity(keyname)
    }
    await updateSavedIdentites(identities)
}

async function updateSavedIdentites(updatedIdentities) {
    try {
        value = await localforage.setItem('identities', updatedIdentities);
        console.log("updated identities. total entries: ", Object.keys(value).length);
        // console.log(JSON.stringify(value))
    } catch (err) {
        console.log("set ooops", err);
    }
}
