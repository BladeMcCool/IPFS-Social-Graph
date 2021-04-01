let recaptchaSiteKey = ""
async function loadRecaptchaScript(profileId) {
    return new Promise(async function(resolve) {
        // if we didnt set up the server to do this then we wont get much of a key back here and wont do anything.
        let key = await getRecaptchaSiteKey()
        if (!key) {
            resolve(true)
        }
        recaptchaSiteKey = key
        let script = document.createElement('script');
        script.onload = function () {
            grecaptcha.ready(async function() {
                if (profileId) {
                    return resolve(await performRecaptchaChallenge(profileId))
                }
                resolve(null)
            });
            //do stuff with the script
        };
        script.src = `https://www.google.com/recaptcha/api.js?render=${key}`;
        document.head.appendChild(script); //or something of the likes
    })
}

async function canTalk(profileId, pubb64) {
    return await new Promise(async function (resolve) {
        let codeCb = function (status) {
            let canTalk = false
            if (status >= 200 && status < 300) {
                canTalk = true
            }
            if ((status >= 400 && status < 500) && (status != 403)) {
                canTalk = true
            }
            resolve(canTalk)
        }
        let payload = {"profileId": profileId}
        try {
            await makeRequest("POST", serviceBaseUrl + "/service/profileBestTipCid", payload, true, codeCb, pubb64)
        } catch(e) {
            ///
        }
    })
}

async function authedCheck(profileId, pubb64) {
    // check profile best tip from server for this.
    //  (using identities[selectedIdentity]["profileid"] since the makeRequest will pull pubkey from same spot for auth by header pubkey-to-peerid-in-wl auth check :)
    // if we get any code lower than 500 that is not 403, then we're good
    // if we get a 403 try the captcha other than a 403 error, then try captcha.
    // if captcha says good, try again for better code.
    // if get a better code, we're good
    // otherwise naaa
    // and naa for bad captcha

    if (await canTalk(profileId, pubb64)) {
        return true
    }
    //can't talk, try captcha
    let recaptchaSuccess = await loadRecaptchaScript(profileId)
    if (recaptchaSuccess) {
        //well thats great. that means we _should_ get a 200 or a 404 most likely.
        if (await canTalk(profileId, pubb64)) {
            return true
        }
    }

    alert("Failed auth check, won't be able to do much.")
    return false
}

function performRecaptchaChallenge(profileId) {
    return new Promise(function(resolve) {
        grecaptcha.execute(recaptchaSiteKey, {action: 'wlrequest'}).then(async function(token) {
            // Add your logic to submit to your backend server here.
            //// HOW TO INTERPREt MY OWN SERVER RESP ??? not sure if i can presently detect failure here.
            let success = await verifyRecaptchaToken(profileId, token);
            console.log(`performRecaptchaChallenge, is human according to G? ${success}`)
            if (success) {
                resolve(true)
            } else {
                resolve(false)
            }
            // there is no reject.
        });
    })
}