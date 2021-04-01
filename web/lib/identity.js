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
    orderedDmPostsByInteracteeProfileId = {}
    setSelectedIdentityProfileId()
    let selectBox = document.getElementById("chooseident")
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
    selectedIdentityPrivKeyImportedForDecrypt = await importPrivkeyFromB64ForDecrypt(identity["priv"])

    // if (!identity["profileid"]) {
    //     //this will happen from making a new one.
    //     console.log("figure out profileId")
    //     identity["profileid"] = await peerutil.peerid(identity["pub"])
    // }
    let profileTipDataFromServer = undefined;
    try {
        showSpinner()
        await authedCheck(identity["profileid"], identity["pub"])
        hideSpinner()
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
    resetSecretSauce()

    try {
        await localforage.setItem('selectedIdentity', keyname);
        console.log("updated selectedIdentity indexeddb");
    } catch (err) {
        console.log("failed to set selectedIdentity indexeddb ??", err);
    }

    // let latestTimelineTextsJson = await getLatestTimelineTexts(identity["pub"], identity["profiletip"])
    // displayTimelineTextsFromServer(latestTimelineTextsJson)
    await updateJsTimeline()
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
    await promptToFollowCurated()
}

async function newIdentity(newidentname, dispname, bio, promptToFollowCurated) {
    console.log('newIdentity: identities is: ', identities);

    let keypair = await generateKey()
    console.log("keypair", keypair)
    let spki = await window.crypto.subtle.exportKey('spki', keypair.publicKey)
    console.log(spki)
    let spkib64 = arrayBufferToBase64String(spki)
    console.log("pubkey b64 in PKIX", spkib64)
    console.log("\n\n")
    let pkcs8 = await window.crypto.subtle.exportKey('pkcs8', keypair.privateKey)
    let pkcs8b64 = arrayBufferToBase64String(pkcs8)
    console.log("privkey b64 in pkcs8", pkcs8b64)
    let profileId = await peerutil.peerid(spkib64)


    // if (!await loadRecaptchaScript(profileId)) {
    //     return
    // }
    showSpinner()
    await authedCheck(profileId, spkib64)
    hideSpinner()
    if (!newidentname) {
        newidentname = getNewIdentName()
    }
    if (!newidentname) {
        return
    }

    let newIdentitySettings = {
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
    let select = document.getElementById('chooseident');
    var opt = document.createElement('option');
    opt.value = keyname;
    opt.innerHTML = keyname;
    select.appendChild(opt);
}

function removeSelectedIdentFromSelect(confirmRemoval){
    let selectBox = document.getElementById("chooseident")
    if (!selectBox.value) {
        return
    }
    console.log("delete for", selectBox.value)
    if (confirmRemoval && !confirm("for real? can't be undone.")) {
        return
    }
    let removeIdentname = selectBox.value
    console.log("do it to", removeIdentname)
    selectBox.remove(selectBox.selectedIndex)
    selectBox.selectedIndex = 0
}

async function deleteSelectedIdentity() {
    removeSelectedIdentFromSelect(true)
    delete identities[removeIdentname]
    await updateSavedIdentites(identities)
    await localforage.setItem('selectedIdentity', null)
    await unselectIdentity()
}

function scrapeSettingsIntoSelectedIdentity() {
    if (!selectedIdentity) {
        console.log("scrapeSettingsIntoSelectedIdentity: no currently selected identity, not doing anything.")
        return
    }
    let identity = identities[selectedIdentity]
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
    document.getElementById("currentprofile_detail").style.display = "none"
    document.getElementById("importprivkeyb64_container").style.display = "inline"
}

async function renameSelectedIdentity() {
    console.log('newIdentity: identities is: ', identities);
    let newidentname = getNewIdentName()
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
    let newidentname = document.getElementById("newidentname").value.trim()
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
    let newidentname = getNewIdentName()
    if (newidentname == undefined) {
        return
    }

    let pkcs8b64 = document.getElementById("importprivkeyb64").value.trim()
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

    let profileId = await peerutil.peerid(importPubkey)
    console.log("trying to import profile with id:", profileId)
    let ipnsDelegate = await IPNSDelegateName()
    console.log("trying to import profile .. got ipnsdelegate from the currently configured server:", ipnsDelegate)
    let profileTipData = await profileBestTip(profileId)
    console.log("trying to import profile with data like:", profileTipData)

    let newIdentitySettings = {
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


function setSelectedIdentityProfileId() {
    if (selectedIdentity && identities[selectedIdentity]) {
        selectedIdentityProfileId = identities[selectedIdentity]["profileid"]
    } else {
        selectedIdentityProfileId = null
    }
}

async function reloadSession() {
    await loadServiceBaseUrl()
    console.log('localforage is: ', localforage);
    console.log('reloadSession: identities is: ', identities);
    try {
        identities = await localforage.getItem('identities');
        selectedIdentity = await localforage.getItem('selectedIdentity');
        if (selectedIdentity) {
            setSelectedIdentityProfileId()
        }
        console.log("identities already there", identities);
        console.log("selectedIdentity already there", selectedIdentity);
    } catch (err) {
        console.log("load oops:", err);
    }
    if (!identities || Object.keys(identities).length === 0) {
        console.log("no existing identities found in indexeddb");
        identities = {}
        await initIdentity()
        return
    }
    if (!identities[selectedIdentity]) {
        selectedIdentity = null
        setSelectedIdentityProfileId()
    }
    for (var idname of Object.keys(identities)) {
        addIdentityToChoices(idname)
    }
    await setIdentity(selectedIdentity)
}

async function createProfilePost(noconfirmFollow) {
    if (!selectedIdentity) {
        alert("select an identity first please")
        return false
    }

    let pubkeyb64 = identities[selectedIdentity]["pub"]
    let privkeyb64 = identities[selectedIdentity]["priv"]

    let inputFlds = {
        "text" : document.getElementById("posttext").value.trim(),
        "dispname" : document.getElementById("dispname").value,
        "bio" : document.getElementById("bio").value,
        "graphtip" : document.getElementById("graphtip").value,
        "profiletip" : document.getElementById("profiletip").value,
        "inreplyto" : document.getElementById("inreplyto").value,
        "dmfor" : document.getElementById("dmfor").value,
        "followprofileid" : document.getElementById("followprofileid").value,
        "unfollowprofileid" : document.getElementById("unfollowprofileid").value,
        "likeofnodecid" : document.getElementById("likeofnodecid").value,
        "unlikeofnodecid" : document.getElementById("unlikeofnodecid").value,
        "retractionofnodecid" : document.getElementById("retractionofnodecid").value,
        "repostofnodecid" : document.getElementById("repostofnodecid").value,
    }

    // sendprivkey = document.getElementById("sendprivkey").checked
    let sendprivkey = false // disabling this for now. ipns publish is way to slow and this is super insecure anyway.

    let confirmFields = {
        // "followprofileid":["follow", clearFollow],
        "unfollowprofileid":["unfollow", clearUnfollow],
        "retractionofnodecid":["retract", clearRetraction],
    }

    if (noconfirmFollow) {
        clearFollow()
    } else {
        confirmFields["followprofileid"] = ["follow", clearFollow]
    }

    for (var key of Object.keys(confirmFields)) {
        let clearFunc = confirmFields[key][1]
        clearFunc()
        if (inputFlds[key]) {
            let confirmText = confirmFields[key][0]
            if (!confirm("really " + confirmText + " " + inputFlds[key] + "?")) {
                return false
            }
        }
    }

    clearRepost()
    clearLike()
    clearUnlike()

    let hasRequiredFld = false
    let requireOneOfFields = [
        "text", "followprofileid", "unfollowprofileid", "repostofnodecid", "retractionofnodecid", "likeofnodecid", "unlikeofnodecid",
    ]
    for (var i = 0; i < requireOneOfFields.length; i++) {
        if (inputFlds[requireOneOfFields[i]]) {
            hasRequiredFld = true
            break
        }
    }

    if (!hasRequiredFld) {
        alert("Please type some text for a post, follow/unfollow another profileid or otherwise set up some action to perform.")
        focusPostText()
        return false
    }

    if (!inputFlds["text"] && inputFlds["inreplyto"]) {
        console.log("clearing replyto that had no text.")
        clearReply()
    }

    if (!inputFlds["graphtip"]) { inputFlds["graphtip"] = null; }
    if (!inputFlds["profiletip"]) { inputFlds["profiletip"] = null; }
    if (!inputFlds["inreplyto"]) { inputFlds["inreplyto"] = null; }
    if (!inputFlds["dmfor"]) { inputFlds["dmfor"] = null; }
    if (!inputFlds["followprofileid"]) { inputFlds["followprofileid"] = null; }
    if (!inputFlds["unfollowprofileid"]) { inputFlds["unfollowprofileid"] = null; }
    if (!inputFlds["likeofnodecid"]) { inputFlds["likeofnodecid"] = null; }
    if (!inputFlds["unlikeofnodecid"]) { inputFlds["unlikeofnodecid"] = null; }
    if (!inputFlds["retractionofnodecid"]) { inputFlds["retractionofnodecid"] = null; }
    if (!inputFlds["repostofnodecid"]) { inputFlds["repostofnodecid"] = null; }

    let useipnsdelegate = !sendprivkey

    let unsignedGraphNodeJson = await unsignedGraphNodeForPost(
        pubkeyb64,
        inputFlds["text"],
        inputFlds["graphtip"],
        inputFlds["dmfor"],
        inputFlds["inreplyto"],
        inputFlds["followprofileid"],
        inputFlds["unfollowprofileid"],
        inputFlds["likeofnodecid"],
        inputFlds["unlikeofnodecid"],
        inputFlds["retractionofnodecid"],
        inputFlds["repostofnodecid"]
    )
    console.log("got unsigned gn like:", unsignedGraphNodeJson)
    let signatureb64 = await getSignature(privkeyb64, unsignedGraphNodeJson)
    console.log("got signature b64 like:", signatureb64)

    let unsignedProfileJson = await unsignedProfileWithFirstPost(pubkeyb64, unsignedGraphNodeJson, signatureb64, inputFlds["dispname"], inputFlds["bio"], inputFlds["profiletip"], useipnsdelegate)
    console.log("got unsigned profile json like:", unsignedProfileJson)

    let unsignedProfile = JSON.parse(unsignedProfileJson)
    document.getElementById("graphtip").value = unsignedProfile.GraphTip
    document.getElementById("profileid").value = unsignedProfile.Id
    document.getElementById("ipnsdelegate").value = unsignedProfile.IPNSDelegate ? unsignedProfile.IPNSDelegate : ""

    let profileSigb64 = await getSignature(privkeyb64, unsignedProfileJson)
    console.log("got signature for that like:", profileSigb64)
    let privkeyb64foripns = sendprivkey ? privkeyb64 : null

    let updatedProfileCid = await publishedProfileCid(pubkeyb64, privkeyb64, unsignedProfileJson, profileSigb64, unsignedProfile.IPNSDelegate ? unsignedProfile.IPNSDelegate : "")
    document.getElementById("profiletip").value = updatedProfileCid

    scrapeSettingsIntoSelectedIdentity() //so that when we updateSavedIdentites we keep whatever was in the fields.
    await updateSavedIdentites(identities)

    if (inputFlds["followprofileid"]) {
        delete unfollows[inputFlds["followprofileid"]] //otherwise spidering code will not re-add anything that was previously unfollowed.
        follows[inputFlds["followprofileid"]] = true
    }
    if (inputFlds["unfollowprofileid"]) {
        delete follows[inputFlds["unfollowprofileid"]] //otherwise spidering code will not un-add anything that was previously followed.
        unfollows[inputFlds["unfollowprofileid"]] = true
    }

    document.getElementById("posttext").value = ""
    clearReply()
    clearFollow()
    clearDmFor()

    await updateJsTimeline()
    return true
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
        let value = await localforage.setItem('identities', updatedIdentities);
        console.log("updated identities. total entries: ", Object.keys(value).length);
        // console.log(JSON.stringify(value))
    } catch (err) {
        console.log("set ooops", err);
    }
}

