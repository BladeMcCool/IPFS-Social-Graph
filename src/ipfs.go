package main

import (
	"archive/tar"
	"bytes"
	"context"
	"crypto/rsa"
	"errors"
	"fmt"
	"github.com/ReneKroon/ttlcache"
	shell "github.com/ipfs/go-ipfs-api"
	"io/ioutil"
	"log"
	"sync"
	"time"
)

type IPFSCommunicator struct {
	shell *shell.Shell
	IPNSDelegateKeyName string
}
func(ic *IPFSCommunicator) makeKeyInIPFS(keyName string) error {
	key, err := ic.shell.KeyGen(context.Background(), keyName, shell.KeyGen.Type("rsa"))
	if err != nil {
		return err
	}
	log.Printf("key made: %#v", key)
	return nil
}
func (ic *IPFSCommunicator) getIPNSDelegateName() *string {
	//make sure the "ipnsdelegate" key exists. this is just kind of hax for the moment to easily allow a profile owner to delegate ipns resolution for their profile to a different key that can publish updates on their behalf in a slightly different format.
	//i imagine that the entries in the delegated lookup page will be a map[profileid]latestcidAndsignature
	//keyname := "ipnsdelegate"
	_ = ic.makeKeyInIPFS(ic.IPNSDelegateKeyName)
	ipfsName, err := Crypter.getIPFSNameFromBinaryRsaKey(ic.IPNSDelegateKeyName)
	if err != nil {
		panic(err)
	}
	log.Printf("getIPNSDelegateName: determined a name of %s", ipfsName)
	return &ipfsName
}

func (ic *IPFSCommunicator) addContentToIPFS(data []byte) string {
	start := time.Now()
	stringreader := bytes.NewReader(data)
	cid, err := ic.shell.Add(stringreader)
	if err != nil {
		panic(err)
	}
	log.Printf("addContentToIPFS: finished after %.2f sec", time.Since(start).Seconds())
	return cid
}

func (ic *IPFSCommunicator) publishIPNSUpdate(cid, keyName string) string {
	log.Printf("publishIPNSUpdate: starting for profileId %s -> %s", keyName, cid)
	start := time.Now()
	//keyFileName := Crypter.keystorePath + keyName
	//var expectName, _ = Crypter.getIPFSNameFromBinaryRsaKey(keyName)
	var expectName, _ = Crypter.getIPNSExpectNameFromBinaryRsaKey(keyName)
	log.Printf("publishIPNSUpdate: new value for key %s / peer id %s: %s", keyName, expectName, cid)
	resp, err := ic.shell.PublishWithDetails("/ipfs/"+ cid, keyName, time.Hour * 100, time.Second * 60, false)
	if err != nil {
		log.Println("publishIPNSUpdate: error", err)
		return ""
	}

	if resp.Value != "/ipfs/" + cid {
		log.Fatalf("Expected to receive %s but got %s", cid, resp.Value)
	}
	if resp.Name != expectName {
		log.Fatalf("publishIPNSUpdate: got unexpected name back: %s -- expected to get %s", resp.Name, expectName)
	}
	log.Printf("publishIPNSUpdate: finished for %s after %.2f sec", keyName, time.Since(start).Seconds())
	return expectName
}

func (ic *IPFSCommunicator) checkCachedProfileIds(profileId string) (string, bool) {
	if profileCid, exists := CacheProfileCids.Get(profileId); exists == true {
		log.Printf("checkCachedProfileIds: profileId %s had a record in the cache: profileCid %s", profileId, profileCid)
		return profileCid.(string), true
	}

	log.Printf("checkCachedProfileIds: profileId %s does not have a record in the cache.", profileId)
	return "", false
}
func (ic *IPFSCommunicator) checkDelegatedIPNS(profileId string) (string, bool) {
	profileCid := Federation.Get(profileId)
	if profileCid != nil {
		log.Printf("checkDelegatedIPNS: profileId %s had a record in the delegated mapping: profileCid %s", profileId, *profileCid)
		return *profileCid, true
	}
	log.Printf("checkDelegatedIPNS: profileId %s does not have a record in the delegated mapping.", profileId)
	return "", false
}
func (ic *IPFSCommunicator) resolveIPNS(cid string) (string, error) {
	start := time.Now()
	log.Printf("resolveIPNS: look up %s ...", cid)
	result, err := ic.shell.Resolve(cid)
	log.Printf("resolveIPNS: got %s -> %s after %.2f sec", cid, result, time.Since(start).Seconds())
	return result, err
}

func (ic *IPFSCommunicator) determineProfileCid(profileId string) (*string, error){
	//var err error
	foundProfileCid, cached := ic.checkCachedProfileIds(profileId)
	log.Printf("determineProfileCid found %s in cached list? %t", profileId, cached)
	if cached {
		return  &foundProfileCid, nil
	}

	foundProfileCid, delegated := ic.checkDelegatedIPNS(profileId)
	log.Printf("determineProfileCid found %s in delegated list? %t", profileId, delegated)
	if delegated {
		return  &foundProfileCid, nil
	}

	//foundProfileCid, err = ic.resolveIPNS(profileId)
	//foundInIpns := err == nil && foundProfileCid != ""
	//log.Printf("determineProfileCid found %s in ipns? %t", profileId, foundInIpns)
	//if err != nil {
	//	return nil, err
	//}

	if foundProfileCid == "" {
		return nil, fmt.Errorf("determineProfileCid: unable to determine for profileId %s", profileId)
	}
	return &foundProfileCid, nil
}

//type delegatedProfileCid map[string]string


func (ic *IPFSCommunicator) getCidFileBytes(cid string) ([]byte, error) {
	start := time.Now()
	if Trash.isIt(cid) {
		return nil, errors.New(fmt.Sprintf("cid %s is marked as trash", cid))
	}

	resp, err := ic.shell.Request("get", cid).Option("create", true).Send(context.Background())
	defer resp.Close()
	if err != nil {
		Trash.throwItIn(cid)
		return nil, err
	}

	tr := tar.NewReader(resp.Output)
	//https://stackoverflow.com/questions/42564146/read-contents-of-tar-file-without-unzipping-to-disk
	// get the next file entry
	h, _ := tr.Next()
	if h.Typeflag != tar.TypeReg {
		return nil, errors.New(fmt.Sprintf("oops wrong kind of data from cid %s", cid))
	}
	bs, _ := ioutil.ReadAll(tr)
	//log.Println(h.Name)
	//log.Println(string(bs))

	//TODO not here really but i'm thinking of it now ... limits on the amount of data we are willing to put in these or accept out.
	log.Printf("getCidFileBytes: finished obtaining %d bytes for cid %s after %.2f sec", len(bs), cid, time.Since(start).Seconds())
	return bs, nil
}

//type TipUpdate struct {
//	ProfileId string
//	ProfileCid string
//	Time time.Time
//	//Signature string /// ? dunno if really needed - we would only
//}


var nonDelegateIPNSMutex sync.RWMutex
//var cacheMutex sync.RWMutex
var IPNSProfileCids = map[string]string{}
//var CacheProfileCids = map[string]string{}
var CacheProfileCids *ttlcache.Cache
//CacheProfileCids =
//CacheProfileCids.S
//CacheProfileCids.SetTTL(time.Duration(24 * time.Hour))

func (ic *IPFSCommunicator) updateCacheEntry(profile *Profile, profileCid string) {
	// I believe we should ONLY cache these when the update is made through our server.
	CacheProfileCids.Set(profile.Id, profileCid)
	log.Printf("updateCacheEntry for %s, profile id %s to new profile cid %s", profile.DisplayName, profile.Id, profileCid)
}

func (ic *IPFSCommunicator) updateDelegateEntry(profile *Profile, profileCid string) {
	Federation.Set(profile.Id, profileCid)
	log.Printf("updateDelegateEntry for %s, profile id %s to new profile cid %s", profile.DisplayName, profile.Id, profileCid)
}
func (ic *IPFSCommunicator) updateNonDelegateEntry(profile *Profile, profileCid string) {
	// if we are here it is because we have the private key and can try to do ipns for it.
	nonDelegateIPNSMutex.Lock()
	IPNSProfileCids[profile.Id] = profileCid
	nonDelegateIPNSMutex.Unlock()

	//also get rid of any reference to the profile id in the delegated map so that we dont keep using it for things that have asked us to do ipns for them.
	Federation.Del(profile.Id)
	log.Printf("updateNonDelegateEntry for %s, profile id %s to new profile cid %s", profile.DisplayName, profile.Id, profileCid)
}

func (ic *IPFSCommunicator) addPrivKeyIPNSPublish(key *rsa.PrivateKey, profileId string, profileCid string) {
	//rename this func later.
	//basically, go take that private key,
	//turn it into a key in the file system
	Crypter.writeBinaryIPFSRsaKey(key, profileId)
	//that ipfs can use,
	//and then use it to publish a name update.
	ic.publishIPNSUpdate(profileCid, profileId)
}


func (ic *IPFSCommunicator) InitProfileCache() {
	CacheProfileCids = ttlcache.NewCache()
	CacheProfileCids.SetTTL(24 * time.Hour)
}
func (ic *IPFSCommunicator) StartIPNSPeriodicUpdater() {
	//delegateIPNSMutex.RLock()
	//currentDelegatedProfileCids, err := ic.getCurrentDelegatedProfileCids(*IPNSDelegateName)
	//if err != nil || currentDelegatedProfileCids == nil {
	//	IPNSDelegatedProfileCid = map[string]string{}
	//}
	//log.Printf("IPNSDelegatedProfileCid of delegated profile and their tip cids on startup: %#v", IPNSDelegatedProfileCid)
	//delegateIPNSMutex.RUnlock()

	minCycleTimeSec := float64(90)
	for {
		ipnsUpdatesCount := 0
		start := time.Now()
		log.Printf("IPNSPeriodicUpdater run starting ...")

		var wg sync.WaitGroup
		wg.Add(1)
		ipnsUpdatesCount++
		go func(wg *sync.WaitGroup){
			defer wg.Done()
			Federation.publishDelegatedIPNSUpdate()
		}(&wg)

		nonDelegateIPNSMutex.RLock()
		for profileId, profileCid := range IPNSProfileCids {
			ipnsUpdatesCount++
			wg.Add(1)
			go func(wg *sync.WaitGroup, cProfileCid, cProfileId string) {
				defer wg.Done()
				//if there is not a key in the keystore named exactly as profileId then there will be a problem.
				result := ic.publishIPNSUpdate(cProfileCid, cProfileId)
				if result != cProfileId {
					log.Printf("Failed to update ipns for %s", cProfileId)
				}
			}(&wg, profileCid, profileId)
		}
		nonDelegateIPNSMutex.RUnlock()
		wg.Wait()

		tookSec := time.Since(start).Seconds()
		log.Printf("IPNSPeriodicUpdater took %.2f sec to submit updates for %d records", tookSec, ipnsUpdatesCount)
		if tookSec < minCycleTimeSec {
			// make sure we don't slam it more than we have to.
			time.Sleep(time.Duration(minCycleTimeSec-tookSec) * time.Second)
		}
	}
}