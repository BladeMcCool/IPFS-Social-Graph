var identities
var selectedIdentity
let selectedIdentityPrivKeyImportedForDecrypt
var importPubkey
let selectedIdentityProfileId
let timelineUpdaterInterval
let superSecretModeEnabled = false

let tlEntryTemplate

let orderedTimelineElements = []
let orderedDmPostsByInteracteeProfileId = {}
let retractedCids = {} //map cid to person who retracted it. just need to only retract things that are done by their owners.
let gnReplyParents = {}
let repostedCids = {}
let followeeProfiles = {}
let follows = {}
let unfollows = {}
let followbacks = {}
let followButtons = {}
let noTsGnodes = {}
let profileTipCache = {}
let gnOfInterestByProfileId = {}
let gnOfInterest = {}
let profilesOfInterest = {}
let fetchingProfileMutex = {}

function resetTextTimelineArea() {
    let target = document.getElementById("tlcontainer")
    target.textContent = "" //apparently not the worst way to make all the existing child elements go away before we render the updated history.
    orderedTimelineElements = []
    gnReplyParents = {}
    repostedCids = {}
    follows = {}
    unfollows = {}
    noTsGnodes = {}
    profileTipCache = {}
    gnOfInterestByProfileId = {}
    followeeProfiles = {}
}

function unfollow(profileId) {
    //set the field and call the create post func.
    document.getElementById("unfollowprofileid").value = profileId
    return createProfilePost()
}
function follow(profileId, noconfirm) {
    //set the field and call the create post func.
    document.getElementById("followprofileid").value = profileId
    return createProfilePost(noconfirm)
}
function retract(cid) {
    document.getElementById("retractionofnodecid").value = cid
    createProfilePost()
}

function profileNametag(profileData) {
    let ProfileId = profileData.Id
    // let shortinfo = ProfileId.substring(ProfileId.length - 5)
    // return `@${profileData.DisplayName} (${shortinfo})`
    // let shortinfo = ProfileId.substring(ProfileId.length - 5)
    return `@${profileData.DisplayName}`
}

//stolen/hacked from https://github.com/bhowell2/binary-insert-js/blob/master/index.ts
//i want to be able to do more than just put it in the array.
function xbinaryInsert(array, insertValue, comparator, domBlaster) {
    /*
    * These two conditional statements are not required, but will avoid the
    * while loop below, potentially speeding up the insert by a decent amount.
    * */
    if (array.length === 0 || comparator(array[0], insertValue) >= 0) {
        array.splice(0, 0, insertValue)
        // console.log("typ1", array)
        domBlaster(0, insertValue)
        return array;
    } else if (array.length > 0 && comparator(array[array.length - 1], insertValue) <= 0) {
        let splicePos = array.length
        array.splice(array.length, 0, insertValue);
        // console.log("typ2", splicePos, array)
        // throw new Error("fuck")
        domBlaster(splicePos, insertValue)
        return array;
    }
    let left = 0, right = array.length;
    let leftLast = 0, rightLast = right;
    while (left < right) {
        const inPos = Math.floor((right + left) / 2)
        const compared = comparator(array[inPos], insertValue);
        if (compared < 0) {
            left = inPos;
        } else if (compared > 0) {
            right = inPos;
        } else {
            right = inPos;
            left = inPos;
        }
        // nothing has changed, must have found limits. insert between.
        if (leftLast === left && rightLast === right) {
            break;
        }
        leftLast = left;
        rightLast = right;
    }
    // use right, because Math.floor is used
    array.splice(right, 0, insertValue);
    // console.log("typ3", array)
    domBlaster(right, insertValue)
    return array
}

function makeATag(text, onclick, nobrackets) {
    var atag = document.createElement("a");
    atag.href = "#"
    atag.onclick = onclick
    if (nobrackets) {
        atag.innerHTML = text
    } else {
        atag.innerHTML = "[" + text +  "]"
    }
    return atag
}

function focusPostText() {
    document.getElementById("posttext").focus()
}

function clearIdentName() {
    document.getElementById("newidentname").value = ""
}
function clearFollow() {
    document.getElementById("followprofileid").value = ""
}

function clearUnfollow() {
    document.getElementById("unfollowprofileid").value = ""
}
function clearRetraction() {
    document.getElementById("retractionofnodecid").value = ""
}
function clearLike() {
    document.getElementById("likeofnodecid").value = ""
}
function clearUnlike() {
    document.getElementById("unlikeofnodecid").value = ""
}

function setSecretSauceEnabler() {
    document.getElementById("profilename").childNodes[0].addEventListener("click", function(){
        incrementSauce()
    })
}

function setEnterButtonAction(){
    document.onkeydown = function (e) {
        e = e || window.event;
        switch (e.which || e.keyCode) {
            case 13 : //the ascii code for the enter button
                createProfilePost()
                break;
        }
    }
}

let nottheMainScreen = ["menuthing", "memberspane"]
function showMainScreen() {
    for (let i = 0; i < nottheMainScreen.length; i++) {
        let thingToHideEl = document.getElementById(nottheMainScreen[i])
        thingToHideEl.style.display="none"
    }
    document.getElementById("mainuipane").style.display=""
}
function isMainScreenShowing() {
    let mainthingHidden = document.getElementById("mainuipane").style.display == "none" ? true : false
    if (!mainthingHidden) {
        //already showing.
        return true
    }
    return false
}

async function menuswap() {
    if (isMainScreenShowing()) {
        document.getElementById("mainuipane").style.display="none"
        document.getElementById("menuthing").style.display=""
        await populateFederationMembers()
    } else {
        showMainScreen()
    }
}

async function populateFederationMembers() {
    document.getElementById("federationmembers").style.display="none"

    let namesJson = await IPNSDelegateNames()
    if (!namesJson) { return }

    let names = JSON.parse(namesJson)
    let outElContainer = document.getElementById("federationmembers")
    let outEl = outElContainer.querySelector("div.fednamelist")
    outEl.textContent = ""
    for (let i = 0; i < names.length; i++) {
        let ptag = document.createElement("p")
        ptag.appendChild(document.createTextNode(names[i]))
        outEl.appendChild(ptag)
    }

    document.getElementById("federationmembers").style.display=""
}


function membersprofilelistUpdate(swapToUnshownMemberspane) {
    resetProfilesInfoArea()

    if (swapToUnshownMemberspane) {
        document.getElementById("mainuipane").style.display = "none"
        document.getElementById("memberspane").style.display = ""
    }

    obtainProfilesInfo().catch((e)=>{
        console.log(e)
    })

}
function membersswap() {
    if (isMainScreenShowing()) {
        //reset the lists that we are about to load
        membersprofilelistUpdate(true)
    } else {
        resetSecretSauce()
        showMainScreen()
    }
}

function clearReply() {
    document.getElementById("inreplyto").value = ""
    document.getElementById("replyingicon").style.display = "none";
    if (document.getElementById("repostofnodecid").value === "") {
        document.getElementById("interactwith").innerHTML = ""
    }
}
function clearUnmatchedReply() {
    clearDmFor()
    if (document.getElementById("inreplyto").value != "" && document.getElementById("repostofnodecid").value != document.getElementById("inreplyto").value) {
        document.getElementById("inreplyto").value = ""
    }
    setpostingStatus()
}
function clearUnmatchedRepost() {
    clearDmFor()
    if (document.getElementById("repostofnodecid").value != "" && document.getElementById("repostofnodecid").value != document.getElementById("inreplyto").value) {
        document.getElementById("repostofnodecid").value = ""
    }
    setpostingStatus()
}

function profileIdByGnodeCid(cid) {
    let gnode = gnOfInterest[cid]
    if (!gnode) { return null }

    return gnode.ProfileId
}

function clearRepost() {
    document.getElementById("repostofnodecid").value = ""
    document.getElementById("repostingicon").style.display = "none";
    if (document.getElementById("inreplyto").value === "") {
        document.getElementById("interactwith").innerHTML = ""
    }
}

function clearDmFor() {
    document.getElementById("dmfor").value = ""
    document.getElementById("dmingicon").style.display = "none";
    document.getElementById("interactwith").innerHTML = ""
}
function clearDmForAndFocus() {
    clearDmFor()
    focusPostText()
}

function clearRepostAndFocus() {
    clearRepost()
    focusPostText()
}
function clearReplyAndFocus() {
    clearReply()
    focusPostText()
}

function showDmingStatus() {
    clearReply()
    clearRepost()
    setpostingStatus()
}

function getInteracteeProfileId() {
    let interacteeProfileId = profileIdByGnodeCid(document.getElementById("inreplyto").value)
    if (!interacteeProfileId) {
        interacteeProfileId = profileIdByGnodeCid(document.getElementById("repostofnodecid").value)
    }
    if (!interacteeProfileId) {
        interacteeProfileId = document.getElementById("dmfor").value
    }
    return interacteeProfileId
}
function getInteracteeName() {
    let interacteeProfileId = getInteracteeProfileId()
    //currently maybe only can do followees?
    if (!profilesOfInterest[interacteeProfileId]) {
        return "[UNOBTAINABLE]"
    }
    return profileNametag(profilesOfInterest[interacteeProfileId])
}
function notposting() {
    //i think we should just clear the icons if we are not in the field.
    // document.getElementById("replyingicon").style.display = "none";
    // document.getElementById("repostingicon").style.display = "none";
    // document.getElementById("interactwith").innerHTML = ""
}

function setpostingStatus() {
    //if there is a reply happening, show the reply icon
    //if there is a repost happening, show the repost icon
    //otherwise show no icons.
    let showInteracteeName = false
    if (document.getElementById("repostofnodecid").value != "") {
        document.getElementById("repostingicon").style.display = "";
        showInteracteeName = true
    } else {
        document.getElementById("repostingicon").style.display = "none"
    }
    if (document.getElementById("inreplyto").value != "") {
        document.getElementById("replyingicon").style.display = "";
        showInteracteeName = true
    } else {
        document.getElementById("replyingicon").style.display = "none";
    }

    if (document.getElementById("dmfor").value != "") {
        document.getElementById("dmingicon").style.display = "";
        showInteracteeName = true
    } else {
        document.getElementById("dmingicon").style.display = "none";
    }

    //i think we should just clear the icons if we are not in the field.
    if (showInteracteeName) {
        let interactWithInfo = document.getElementById("interactwith")
        interactWithInfo.innerHTML = jdenticon.toSvg(getInteracteeProfileId(), 15);
        interactWithInfo.querySelector("svg").classList.add("smallericon")
        interactWithInfo.appendChild(document.createTextNode(getInteracteeName()))
    }



}

async function promptToFollowCurated() {
    let limit = 1
    let curatedProfileInfoJson = await makeRequest("GET", serviceBaseUrl + `/service/curatedProfiles?limit=${limit}`)
    let curatedProfileinfo = JSON.parse(curatedProfileInfoJson)
    for (let profileId in curatedProfileinfo) {
        let profileData
        try {
            profileData = await fetchCheckProfile(profileId, curatedProfileinfo[profileId])
        } catch(e) {
            console.log(e)
        }
        let confirmText = `Would you like to follow suggested profile ${profileId}?`
        if (profileData) {
            confirmText = `Would you like to follow suggested profile ${profileNametag(profileData)}?`
        }
        if (confirm(confirmText)) {
            await follow(profileId, true)
        }
    }
}


function cheesyDate(dateobj) {
    // return dateobj.toISOString().split('.')[0]+"Z" //cheesy, but works. i didnt invent it.
    return moment(dateobj).fromNow()
}


let secretSauceCounter = 0
let secretSauceThreshold = 7
function resetSecretSauce() {
    secretSauceCounter = 0
    superSecretModeEnabled = false
}
function incrementSauce() {
    secretSauceCounter++
    console.log("secretSauce ", secretSauceCounter)
    if (secretSauceCounter >= secretSauceThreshold) {
        superSecretModeEnabled = true
    }
}

function resetProfilesInfoArea() {
    document.getElementById("serverlist").textContent = ""
    document.getElementById("followees").textContent = ""
}

myOnload = async function() {
    // console.log("DEBUGGGGGGGG do naaathin")
    // return


    tlEntryTemplate = document.getElementById("telentry_template").querySelector("div")
    await startIpfs()
    await reloadSession()
    setSecretSauceEnabler()
    setEnterButtonAction()
    focusPostText()
    hideSpinner()
}

window.addEventListener('DOMContentLoaded', myOnload, false);
