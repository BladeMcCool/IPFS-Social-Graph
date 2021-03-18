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
    setSelectedIdentityProfileId()
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

    if (timelineUpdaterInterval) {
        clearInterval(timelineUpdaterInterval)
    }
    resetTextTimelineArea()
    // displayTimelineTextsFromServer("[]")
    identity = identities[selectedIdentity]

    pubTextarea = document.getElementById("pubkeyb64")
    pubTextarea.innerHTML = identity["pub"]
    privTextarea = document.getElementById("privkeyb64")
    privTextarea.innerHTML = identity["priv"]


    // if (!identity["profileid"]) {
    //     //this will happen from making a new one.
    //     console.log("figure out profileId")
    //     identity["profileid"] = await peerutil.peerid(identity["pub"])
    // }
    let profileTipDataFromServer = undefined;
    try {
        await authedCheck(identity["profileid"], identity["pub"])
        profileTipDataFromServer = await profileBestTip(identity["profileid"])
    } catch (e) {
        console.log("failed to get best tip from server, oh well.")
    }

    if (profileTipDataFromServer && profileTipDataFromServer["ProfileCid"] && (profileTipDataFromServer["ProfileCid"] != identity["profiletip"])) {
        console.log("we think these two are different:", profileTipDataFromServer["ProfileCid"], identity["profiletip"])
        if (confirm("Server sent profile best tip cid of " + profileTipDataFromServer["ProfileCid"] + ", switch to that?")) {
            identity["profiletip"] = profileTipDataFromServer["ProfileCid"]
            identity["graphtip"] = profileTipDataFromServer["ProfileData"]["GraphTip"]
            identity["dispname"] = profileTipDataFromServer["ProfileData"]["DisplayName"]
            identity["bio"] = profileTipDataFromServer["ProfileData"]["Bio"]
        }
    }

    document.getElementById("dispname").value = identity["dispname"] ? identity["dispname"] : ""
    document.getElementById("bio").value = identity["bio"] ? identity["bio"] : ""

    document.getElementById("profileid").value = identity["profileid"] ? identity["profileid"] : ""
    document.getElementById("ipnsdelegate").value = identity["ipnsdelegate"] ? identity["ipnsdelegate"] : ""
    document.getElementById("profiletip").value = identity["profiletip"] ? identity["profiletip"] : ""
    document.getElementById("graphtip").value = identity["graphtip"] ? identity["graphtip"] : ""
    document.getElementById("sendprivkey").checked = identity["sendprivkey"] ? identity["sendprivkey"] : false

    document.getElementById("currentprofile_detail").style.display = "inline"
    document.getElementById("importprivkeyb64_container").style.display = "none"

    document.getElementById("posttext").value = ""
    document.getElementById("inreplyto").value = ""
    focusPostText()

    let mysmallIconSvg = document.getElementById("profilename").childNodes[0]
    mysmallIconSvg.setAttribute("data-jdenticon-value", identity["profileid"] ? identity["profileid"] : "")
    jdenticon.update(mysmallIconSvg)
    document.getElementById("profilename").childNodes[1].textContent = profileNametag({Id:identity["profileid"] ? identity["profileid"] : "", DisplayName: identity["dispname"] ? identity["dispname"] : ""})

    try {
        await localforage.setItem('selectedIdentity', keyname);
        console.log("updated selectedIdentity indexeddb");
    } catch (err) {
        console.log("failed to set selectedIdentity indexeddb ??", err);
    }

    // let latestTimelineTextsJson = await getLatestTimelineTexts(identity["pub"], identity["profiletip"])
    // displayTimelineTextsFromServer(latestTimelineTextsJson)
    await loadJsTimeline()
    timelineUpdaterInterval = setInterval(() => {
        updateJsTimeline()
        updateFriendlyTimestamps()
    }, 60000)
}

function updateFriendlyTimestamps() {
    for (let profileId in gnOfInterestByProfileId) {
        for (let k in gnOfInterestByProfileId[profileId]) {
            let gnode = gnOfInterestByProfileId[profileId][k]
            gnode.domElements.tsTextnode.textContent = cheesyDate(gnode.jsDate) + " "
        }
    }
}

async function initIdentity() {
    let name
    while (!name) {
        name = prompt("Please enter a Display Name to use for a new profile")
    }
    let bio = prompt("Please enter some text for a bio")
    // document.getElementById("dispname").value = name
    // document.getElementById("bio").value = bio
    await newIdentity(name, name, bio)
}

async function newIdentity(newidentname, dispname, bio) {
    console.log('newIdentity: identities is: ', identities);

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
    profileId = await peerutil.peerid(spkib64)


    // if (!await loadRecaptchaScript(profileId)) {
    //     return
    // }
    await authedCheck(profileId, spkib64)
    if (!newidentname) {
        newidentname = getNewIdentName()
    }
    if (!newidentname) {
        return
    }

    newIdentitySettings = {
        "pub":spkib64,
        "priv":pkcs8b64,
        "dispname": dispname ? dispname : "",
        "bio": bio ? bio : "",
        "graphtip":"",
        "profiletip":"",
        "profileid":profileId,
        "ipnsdelegate":"",
    }

    identities[newidentname] = newIdentitySettings
    selectedIdentity = newidentname
    setSelectedIdentityProfileId()
    addIdentityToChoices(newidentname)
    await setIdentity(newidentname)
    scrapeSettingsIntoSelectedIdentity() //so that when we updateSavedIdentites we keep whatever was in the fields.
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
    await localforage.setItem('selectedIdentity', keyname)
    await unselectIdentity()
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

async function unselectIdentity() {
    selectedIdentity = null
    setSelectedIdentityProfileId()
    localforage.setItem('selectedIdentity', selectedIdentity)

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

    if (timelineUpdaterInterval) {
        clearInterval(timelineUpdaterInterval)
    }

    resetTextTimelineArea()
    // displayTimelineTextsFromServer("[]")
    document.getElementById("currentprofile_detail").style.display = "none"
    document.getElementById("importprivkeyb64_container").style.display = "inline"
}

async function renameSelectedIdentity() {
    console.log('newIdentity: identities is: ', identities);
    newidentname = getNewIdentName()
    if (newidentname == undefined) {
        return
    }

    identities[newidentname] = identities[selectedIdentity]
    delete identities[selectedIdentity]
    selectedIdentity = newidentname
    setSelectedIdentityProfileId()

    removeSelectedIdentFromSelect(false)
    addIdentityToChoices(newidentname)
    scrapeSettingsIntoSelectedIdentity() //so that when we updateSavedIdentites we keep whatever was in the fields.
    await setIdentity(newidentname)
    await updateSavedIdentites(identities)
    clearIdentName()
}
function getNewIdentName() {
    newidentname = document.getElementById("newidentname").value.trim()
    if (!newidentname) {
        alert("Please type a name for it")
        console.log("not creating identity with no name")
        return undefined
    }
    if (identities[newidentname]) {
        alert("Name already in use, choose something else or delete it first.")
        console.log("not overwriting existing identity named", newidentname)
        return  undefined
    }
    return newidentname
}
async function importKeyAsIdentity() {
    newidentname = getNewIdentName()
    if (newidentname == undefined) {
        return
    }

    pkcs8b64 = document.getElementById("importprivkeyb64").value.trim()
    // console.log("privkey b64 in pkcs8", pkcs8b64)
    var spkib64
    try {
        spkib64 = await derivePubkeyFromPrivkey(pkcs8b64)
    } catch(err) {
        console.log("error with derivePubkeyFromPrivkey from ", pkcs8b64)
        console.log(err)
        return
    }
    console.log("pubkey b64 in PKIX", spkib64)
    importPubkey = spkib64

    profileId = await peerutil.peerid(importPubkey)
    console.log("trying to import profile with id:", profileId)
    ipnsDelegate = await IPNSDelegateName()
    console.log("trying to import profile .. got ipnsdelegate from the currently configured server:", ipnsDelegate)
    profileTipData = await profileBestTip(profileId)
    console.log("trying to import profile with data like:", profileTipData)

    newIdentitySettings = {
        "pub":spkib64,
        "priv":pkcs8b64,
        "dispname":profileTipData ? profileTipData["ProfileData"]["DisplayName"] : "",
        "bio":profileTipData ? profileTipData["ProfileData"]["Bio"] : "",
        "graphtip":profileTipData ? profileTipData["ProfileData"]["GraphTip"] : "",
        "profiletip":profileTipData ? profileTipData["ProfileCid"]: "",
        "profileid":profileId,
        "ipnsdelegate":ipnsDelegate,
    }

    identities[newidentname] = newIdentitySettings
    addIdentityToChoices(newidentname)
    scrapeSettingsIntoSelectedIdentity() //so that when we updateSavedIdentites we keep whatever was in the fields.
    await setIdentity(newidentname)
    await updateSavedIdentites(identities)
    clearIdentName()
}


async function chooseIdentity(keyname) {
    // await cancelCurrentHistoryRequest()
    scrapeSettingsIntoSelectedIdentity()
    if (!keyname) {
        console.log("choose with no keyname , should wipe stuff")
        await unselectIdentity()
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
