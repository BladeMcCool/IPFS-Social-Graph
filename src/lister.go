package main

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"sync"
	"time"
)

type  Lister struct {
	WlProfileIds        map[string]bool
	BlProfileIds        map[string]bool
	//TODO captchaWl separate from BaseWL and during the periodic rebuild just add those captcha ones back in.
	BaseWlProfileIds    map[string]bool
	WlProfileIdMutex    sync.RWMutex
	BaseWlProfileIdList []string
	CuratedProfileIdList []string
}

func (l *Lister) CheckWl(profileId string) bool {
	l.WlProfileIdMutex.Lock()
	defer l.WlProfileIdMutex.Unlock()
	if _, found := l.WlProfileIds[profileId]; found {
		return true
	}
	return false
}
func (l *Lister) SetBaseWl(profileId string) {
	l.WlProfileIdMutex.RLock()
	defer l.WlProfileIdMutex.RUnlock()
	if _, found := l.BlProfileIds[profileId]; found {
		// NOT adding anything from the Bl to the Wl.
		log.Printf("SetBaseWl: not adding %s due to presence in bl", profileId)
		return
	}
	log.Printf("SetBaseWl: adding %s to Wl", profileId)
	l.BaseWlProfileIds[profileId] = true
	l.WlProfileIds[profileId] = true
}
func (l *Lister) CheckBl(profileId string) bool {
	l.WlProfileIdMutex.Lock()
	defer l.WlProfileIdMutex.Unlock()
	if _, found := l.BlProfileIds[profileId]; found {
		return true
	}
	return false
}
func (l *Lister) setupBl(dir string) {
	// read the file.
	filePath := "bl.json"
	if dir != "" {
		filePath = dir + "/" + filePath
	}
	file, err := ioutil.ReadFile(filePath) //its totally fine if this isnt here, we will just skip having it then.
	if err != nil {
		log.Printf("setupBl err reading file %s", err.Error())
		return
	}

	data := map[string]string{} //to just be compatible with output from federated profiles list
	err = json.Unmarshal(file, &data)
	if err != nil {
		log.Printf("setupBl err decodig json %s", err.Error())
		return
	}

	bl := map[string]bool{}
	for i, _ := range data {
		bl[i] = true
	}
	log.Printf("setupBl - %d bl entries", len(bl))

	l.WlProfileIdMutex.RLock()
	defer l.WlProfileIdMutex.RUnlock()
	l.BlProfileIds = bl
}

func (l *Lister) setupWl() {
	if l.WlProfileIds == nil {
		l.WlProfileIds = map[string]bool{}
		l.BaseWlProfileIds = map[string]bool{}
	}
	for _, profileId := range l.BaseWlProfileIdList {
		l.WlProfileIds[profileId] = true
		l.BaseWlProfileIds[profileId] = true
	}
	log.Printf("setupWl added %d profiles to the approved list", len(l.BaseWlProfileIdList))
}
func (l *Lister) setupExtendedWl(s *APIService) {
	minCycleTimeSec := float64(90)
	log.Println("setupExtendedWl starting up")
	for {

		start := time.Now()
		wg := sync.WaitGroup{}

		newWlMu := sync.Mutex{}
		newWlProfileIds := map[string]bool{}
		//l.WlProfileIdMutex.Lock()
		//l.WlProfileIds =
		//l.WlProfileIdMutex.Unlock()

		//added := map[string]int64{}
		log.Printf("setupExtendedWl total number of wl profiles in extended wl before processing update: %d", len(l.WlProfileIds))
		for profileId, _ := range l.BaseWlProfileIds {
			log.Printf("setupExtendedWl going to add followees of baseWl profileid %s", profileId)
			wg.Add(1)
			go func(profileId string) {
				historyWls := s.getHistoryFollows(profileId)
				newWlMu.Lock()
				newWlProfileIds[profileId] = true
				for _, followeePprofileId := range historyWls {
					newWlProfileIds[followeePprofileId] = true
					log.Printf("setupExtendedWl baseWl %s follow of %s (add to wl)", profileId, followeePprofileId)
				}
				newWlMu.Unlock()
				log.Printf("setupExtendedWl added %d entries on behalf of profileId %s", len(historyWls), profileId)
				wg.Done()
			}(profileId)
		}
		wg.Wait()
		log.Printf("setupExtendedWl: finished after %.2f sec", time.Since(start).Seconds())
		l.WlProfileIdMutex.Lock()
		l.WlProfileIds = newWlProfileIds
		log.Printf("setupExtendedWl total number of wl profiles in extended wl after processing update: %d", len(l.WlProfileIds))
		l.WlProfileIdMutex.Unlock()

		tookSec := time.Since(start).Seconds()
		log.Printf("setupExtendedWl took %.2f sec to complete this cycle getting wl extension from %d BaseWlProfileIdListed profile histories", tookSec, len(l.BaseWlProfileIdList))
		if tookSec < minCycleTimeSec {
			// make sure we don't slam it more than we have to.
			time.Sleep(time.Duration(minCycleTimeSec-tookSec) * time.Second)
		}

	}
}