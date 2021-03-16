package main

import (
	"context"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
	"golang.org/x/crypto/acme/autocert"
	"log"
	"os"
	"sync"
	"time"

	//ipns "github.com/ipfs/go-ipns"
	//"log"
	"net/http"
)

type APIService struct {
	TimeService         TimeService
	WlProfileIds        map[string]bool
	BaseWlProfileIds    map[string]bool
	WlProfileIdMutex    sync.RWMutex
	FilePathOverride    string
	ListenPort          string
	BaseWlProfileIdList []string
	TLSHostName         string
	TLSDataDir          string
}

//var WlProfileIds = map[string]bool{}
//var WlProfileIdMutex = sync.RWMutex{}
func (s *APIService) Start() {
	if s.TLSHostName != "" && s.TLSDataDir != "" {
		log.Printf("setting up for TLS Server ...")
		s.StartTLSServer()
	} else {
		log.Printf("one or more of TLSHostName and TLSDataDir are not set, not setting up for TLS Server")
		err := http.ListenAndServe(":"+s.ListenPort, s.getHttpHandler())
		if err != nil {
			panic(err)
		}
	}

}

func (s *APIService) getHttpHandler() http.Handler {

	c := cors.New(cors.Options{
		AllowedOrigins: []string{"*"}, // All origins
		AllowedMethods: []string{"GET", "POST"},
	})

	router := mux.NewRouter()

	filePath := "./web"
	if s.FilePathOverride != "" {
		filePath = s.FilePathOverride
	}

	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filePath+"/index.html")
	})
	router.HandleFunc("/experiment.html", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filePath+"/experiment.html")
	})
	router.PathPrefix("/lib").Handler(http.StripPrefix("/lib", http.FileServer(http.Dir(filePath+"/lib"))))

	authedRouter := router.PathPrefix("/service").Subrouter()
	// some middleware to auth by pubkey
	authedRouter.Use(s.WlProfileIdViaPubkeyHeaderAuthMiddleware)
	authedRouter.HandleFunc("/unsignedGraphNodeForPost", s.unsignedGraphNodeForPost).Methods("POST")
	authedRouter.HandleFunc("/unsignedProfileWithFirstPost", s.unsignedProfileWithFirstPost).Methods("POST")
	authedRouter.HandleFunc("/publishedProfileCid", s.publishedProfileCid).Methods("POST")
	authedRouter.HandleFunc("/updateProfileCid", s.updateProfileCid).Methods("POST")
	authedRouter.HandleFunc("/IPNSDelegateName", s.IPNSDelegateName).Methods("GET", "POST")
	authedRouter.HandleFunc("/history", s.history).Methods("POST")
	authedRouter.HandleFunc("/profileBestTip", s.profileBestTip).Methods("POST")
	authedRouter.HandleFunc("/profileBestTipCid", s.profileBestTipCid).Methods("POST")
	return c.Handler(router)
}

func (s *APIService) StartTLSServer() {

	// Note: use a sensible value for data directory
	// this is where cached certificates are stored
	if _, err := os.Stat(s.TLSDataDir); os.IsNotExist(err) {
		err = os.Mkdir(s.TLSDataDir, 0644)
		if err != nil {
			panic(err)
		}
	}
	log.Printf("addTLSServer: TLSHostName is %s, TLSDataDir is %s", s.TLSHostName, s.TLSDataDir)
	hostPolicy := func(ctx context.Context, host string) error {
		// Note: change to your real domain
		allowedHost := s.TLSHostName
		log.Printf("APIServer addTLSServer: setting up letsencrypt hostpolicy for %s", s.TLSHostName)
		if host == allowedHost {
			return nil
		}
		return fmt.Errorf("acme/autocert: only %s host is allowed", allowedHost)
	}

	httpsSrv := &http.Server{
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
		IdleTimeout:  120 * time.Second,
		Handler:      s.getHttpHandler(),
	}
	//httpsSrv = makeHTTPServer()
	m := &autocert.Manager{
		Prompt:     autocert.AcceptTOS,
		HostPolicy: hostPolicy,
		Cache:      autocert.DirCache(s.TLSDataDir),
	}

	httpsSrv.Addr = ":443"
	httpsSrv.TLSConfig = &tls.Config{GetCertificate: m.GetCertificate}
	go func() {
		log.Println("addTLSServer: about to ListenAndServeTLS")
		err := httpsSrv.ListenAndServeTLS("", "")
		if err != nil {
			panic(err)
		}
	}()
	log.Println("addTLSServer: about to add regular http handler such that it handles autocert stuff and redirects everything else to https")

	regSrv := &http.Server{
		Addr:         ":80",
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
		IdleTimeout:  120 * time.Second,
		Handler:      m.HTTPHandler(forceHttps()),
	}
	err := regSrv.ListenAndServe()
	if err != nil {
		panic(err)
	}

}

//func makeServerFromMux(mux *http.ServeMux) *http.Server {
//	// set timeouts so that a slow or malicious client doesn't
//	// hold resources forever
//	return &http.Server{
//		ReadTimeout:  5 * time.Second,
//		WriteTimeout: 5 * time.Second,
//		IdleTimeout:  120 * time.Second,
//		Handler:      mux,
//	}
//}

func forceHttps() *http.ServeMux {
	handleRedirect := func(w http.ResponseWriter, r *http.Request) {
		newURI := "https://" + r.Host + r.URL.String()
		http.Redirect(w, r, newURI, http.StatusFound)
	}
	mux := &http.ServeMux{}
	mux.HandleFunc("/", handleRedirect)
	return mux
}

func (s *APIService) setupWl() {
	for _, profileId := range s.BaseWlProfileIdList {
		s.WlProfileIds[profileId] = true
		s.BaseWlProfileIds[profileId] = true
	}
	log.Printf("setupWl added %d profiles to the approved list", len(s.BaseWlProfileIdList))
}
func (s *APIService) setupExtendedWl() {
	minCycleTimeSec := float64(90)
	log.Println("setupExtendedWl starting up")
	for {

		start := time.Now()
		wg := sync.WaitGroup{}

		newWlMu := sync.Mutex{}
		newWlProfileIds := map[string]bool{}
		//s.WlProfileIdMutex.Lock()
		//s.WlProfileIds =
		//s.WlProfileIdMutex.Unlock()

		//added := map[string]int64{}
		log.Printf("setupExtendedWl total number of wl profiles in extended wl before processing update: %d", len(s.WlProfileIds))
		for _, profileId := range s.BaseWlProfileIdList {
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
		s.WlProfileIdMutex.Lock()
		s.WlProfileIds = newWlProfileIds
		log.Printf("setupExtendedWl total number of wl profiles in extended wl after processing update: %d", len(s.WlProfileIds))
		s.WlProfileIdMutex.Unlock()

		tookSec := time.Since(start).Seconds()
		log.Printf("setupExtendedWl took %.2f sec to complete this cycle getting wl extension from %d BaseWlProfileIdListed profile histories", tookSec, len(s.BaseWlProfileIdList))
		if tookSec < minCycleTimeSec {
			// make sure we don't slam it more than we have to.
			time.Sleep(time.Duration(minCycleTimeSec-tookSec) * time.Second)
		}

	}
}

func (s *APIService) getHistoryFollows(profileId string) []string {
	tl := &Timeline{
		crypter:   Crypter,
		ipfs:      IPFS,
		profileId: profileId,
	}
	err := tl.LoadProfile()
	if err != nil {
		log.Printf("getHistoryFollows loadProfile error: %s", err.Error())
		return nil
	}
	graphNodeHistory, err := tl.fetchGraphNodeHistory(tl.profile, false)
	if err != nil {
		log.Printf("getHistoryFollows fetchGraphNodeHistory error: %s", err.Error())
		return nil
	}
	return tl.extractFollowsProfileCids(graphNodeHistory)
}

func (s *APIService) WlProfileIdViaPubkeyHeaderAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		//log.Printf("WlProfileIdViaPubkeyHeaderAuthMiddleware r.Url like %#v", r.URL)
		if r.TLS == nil {
			// if not doing https, its because its running locally and therefore locking the server down isnt much of a concern.
			log.Printf("WlProfileIdViaPubkeyHeaderAuthMiddleware not https -- allowing request")
			next.ServeHTTP(w, r)
			return
		}

		profileId, onWl := s.checkHeaderForPubkeyOnWl(r.Header.Get("X-Pubkey-B64"))
		if !onWl {
			log.Printf("FORBIDDEN Profileid '%s' not on wl.", profileId)
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		log.Printf("Authenticated profileId %s\n", profileId)
		// Pass down the request to the next middleware (or final handler)
		next.ServeHTTP(w, r)
	})
}
func (s *APIService) checkHeaderForPubkeyOnWl(pubkeyB64 string) (string, bool) {
	if pubkeyB64 == "" {
		return "", false
	}
	pubkey, err := getRSAPubkeyFromB64(pubkeyB64)
	if err != nil {
		return "", false
	}
	profileId := Crypter.getPeerIDBase58FromPubkey(pubkey)
	s.WlProfileIdMutex.RLock()
	defer s.WlProfileIdMutex.RUnlock()
	if _, found := s.WlProfileIds[profileId]; !found {
		return profileId, false
	}
	log.Printf("checkHeaderForPubkeyOnWl: %s is on the list.", profileId)
	return profileId, true
}

type CreateProfileJsonArgs struct {
	Pubkey              string  `json: "pubkey"`
	Text                *string `json: "text,omitempty"`
	Previous            *string `json: "previous,omitempty"`
	InReplyTo           *string `json: "inreplyto,omitempty"`
	FollowProfileId     *string `json: "followprofileid,omitempty"`
	UnfollowProfileId   *string `json: "unfollowprofileid,omitempty"`
	LikeOfNodeCid       *string `json: "likeofnodecid,omitempty"`
	UnlikeOfNodeCid     *string `json: "unlikeofnodecid,omitempty"`
	RetractionOfNodeCid *string `json: "retractionofnodecid,omitempty"`
	RepostOfNodeCid     *string `json: "repostofnodecid,omitempty"`
}

func (s *APIService) unsignedGraphNodeForPost(w http.ResponseWriter, r *http.Request) {
	//bodyall, err := ioutil.ReadAll(r.Body)
	//log.Printf("entire contents of post body: '%s'", bodyall)
	//log.Printf("content len of body: '%d'", r.ContentLength)
	//return
	log.Printf("method 1 start")
	args := &CreateProfileJsonArgs{}
	err := json.NewDecoder(r.Body).Decode(&args)
	_ = err
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("%#v", args)

	pubkey, err := getRSAPubkeyFromB64(args.Pubkey)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	graphNode := &GraphNode{
		Version:   1,
		ProfileId: Crypter.getPeerIDBase58FromPubkey(pubkey),
		//Post: firstPost,
		Previous: args.Previous,
	}

	if args.Text != nil && *args.Text != "" {
		firstPostCid := IPFS.addContentToIPFS([]byte(*args.Text))
		firstPost := &Post{
			MimeType: "text/plain",
			Cid:      firstPostCid,
			Date:     s.TimeService.GetTime(),
		}
		if args.InReplyTo != nil && *args.InReplyTo != "" {
			firstPost.Reply = []string{*args.InReplyTo} //just one for now this way, multireply later.
		}
		graphNode.Post = firstPost
	}
	if args.FollowProfileId != nil && *args.FollowProfileId != "" {
		graphNode.PublicFollow = []string{*args.FollowProfileId} //just one for now this way for follows as well.
	}
	if args.UnfollowProfileId != nil && *args.UnfollowProfileId != "" {
		graphNode.PublicUnfollow = []string{*args.UnfollowProfileId} //just one for now this way for follows as well.
	}
	if args.RetractionOfNodeCid != nil && *args.RetractionOfNodeCid != "" {
		graphNode.RetractionOfNodeCid = args.RetractionOfNodeCid
	}
	if args.RepostOfNodeCid != nil && *args.RepostOfNodeCid != "" {
		graphNode.RepostOfNodeCid = args.RepostOfNodeCid
	}
	serializedGraphNode, err := json.Marshal(graphNode)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("method 1 finished well")
	w.WriteHeader(http.StatusOK)
	w.Write(serializedGraphNode)
	//fmt.Fprintf(w, "Category: %v\n", vars["category"])
}

func getRSAPubkeyFromB64(b64 string) (*rsa.PublicKey, error) {
	decoded, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		log.Println("decode error:", err)
		return nil, err
	}
	pubkeyInterface, err := x509.ParsePKIXPublicKey(decoded)
	if err != nil {
		return nil, err
	}
	pubkey := pubkeyInterface.(*rsa.PublicKey)
	return pubkey, nil
}
func getRSAPrivatekeyFromB64(b64 string) (*rsa.PrivateKey, error) {
	decoded, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		log.Println("decode error:", err)
		return nil, err
	}
	privkeyInterface, err := x509.ParsePKCS8PrivateKey(decoded)
	if err != nil {
		return nil, err
	}
	privkey := privkeyInterface.(*rsa.PrivateKey)
	return privkey, nil
}

type CreateProfileStep2JsonArgs struct {
	Pubkey                string  `json: "pubkey"`
	UnsignedGraphNodeJson string  `json: "unsignedGraphNodeJson"`
	Signatureb64          string  `json: "signatureb64"`
	DisplayName           string  `json: "displayname"`
	Bio                   string  `json: "bio"`
	Previous              *string `json: "previous,omitempty"`
	UseIPNSDelegate       bool    `json: "useipnsdelegate,omitempty"`
}

func (s *APIService) unsignedProfileWithFirstPost(w http.ResponseWriter, r *http.Request) {
	var err error

	//bodyall, err := ioutil.ReadAll(r.Body)
	//log.Printf("entire contents of post body: '%s'", bodyall)
	//log.Printf("content len of body: '%d'", r.ContentLength)
	//return
	//
	log.Printf("method 2 start")
	args := &CreateProfileStep2JsonArgs{}
	log.Printf("here0")
	err = json.NewDecoder(r.Body).Decode(&args)
	log.Printf("here1")
	_ = err
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("%#v", args)

	pubkey, err := getRSAPubkeyFromB64(args.Pubkey)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	graphNode := &GraphNode{}
	err = json.Unmarshal([]byte(args.UnsignedGraphNodeJson), graphNode)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	sigDecoded, err := base64.StdEncoding.DecodeString(args.Signatureb64)
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	graphNode.Signature = sigDecoded
	log.Printf("%#v", graphNode)

	fakeTl := &Timeline{ //just for util funcs ... maybe they dont belong where they are
		crypter: Crypter,
		ipfs:    IPFS,
	}
	validSig := fakeTl.checkGraphNodeSignature(graphNode, pubkey)
	if validSig != true {
		log.Printf("invalid signature :(")
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	graphNodeCid, err := fakeTl.publishGraphNodeToIPFS(graphNode)
	if err != nil {
		log.Println("publish graphnode to ipfs err:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	//if the person doing some following is on the base wl (check with lock), put the followee people into the live wl.
	if graphNode.PublicFollow != nil {
		s.WlProfileIdMutex.Lock()
		if _, found := s.BaseWlProfileIds[graphNode.ProfileId]; found {
			for _, followProfileId := range graphNode.PublicFollow {
				s.WlProfileIds[followProfileId] = true
			}
			log.Printf("Added new follow by baseWl profile id %s of followee profile id %s to the live profile wl", graphNode.ProfileId, graphNode.ProfileId)
		}
		s.WlProfileIdMutex.Unlock()
	}

	pubKeyBytes, pubKeyHash := fakeTl.calculateProfileId(pubkey)
	profile := Profile{
		Id:          pubKeyHash,
		Pubkey:      pubKeyBytes,
		DisplayName: args.DisplayName,
		Bio:         args.Bio,
		GraphTip:    graphNodeCid,
		Previous:    args.Previous,
	}
	if args.UseIPNSDelegate == true {
		_, ipnsDelegate, err := fakeTl.ipfs.getIPNSDelegateName()
		if err != nil {
			log.Println(err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		profile.IPNSDelegate = &ipnsDelegate
	}

	serializedUnsignedProfile, err := json.Marshal(profile)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("method 2 finish well")
	log.Printf("wheeeeeeee whats next?")
	w.WriteHeader(http.StatusOK)
	w.Write(serializedUnsignedProfile)
	//fmt.Fprintf(w, "Category: %v\n", vars["category"])
}

type CreateProfileStep3JsonArgs struct {
	Pubkey              string `json: "pubkey"`
	Privkey             string `json: "privkey,omitempty"`
	UnsignedProfileJson string `json: "unsignedProfileJson"`
	Signatureb64        string `json: "signatureb64"`
}

func (s *APIService) publishedProfileCid(w http.ResponseWriter, r *http.Request) {
	var err error
	log.Printf("method 3 start")
	args := &CreateProfileStep3JsonArgs{}
	log.Printf("here0")
	err = json.NewDecoder(r.Body).Decode(&args)
	log.Printf("here1")
	_ = err
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("%#v", args)

	pubkey, err := getRSAPubkeyFromB64(args.Pubkey)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	profile := &Profile{}
	err = json.Unmarshal([]byte(args.UnsignedProfileJson), profile)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	sigDecoded, err := base64.StdEncoding.DecodeString(args.Signatureb64)
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	profile.Signature = sigDecoded
	log.Printf("%#v", profile)

	fakeTl := &Timeline{ //just for util funcs ... maybe they dont belong where they are
		crypter: Crypter,
		ipfs:    IPFS,
	}
	validSig, err := fakeTl.checkProfileSignature(profile, pubkey)
	//tODO why does the other checkNNNSig only return a bool and not a error too? also that check below is gross.
	if err != nil || !validSig {
		log.Printf("invalid signature :(")
		log.Print(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	profileCid := fakeTl.publishProfileToIPFS(profile) //TODO this should also return an err like the other publish

	fakeTl.ipfs.updateCacheEntry(profile, profileCid)
	if profile.IPNSDelegate != nil {
		//fakeTl.publishDelegatedIPNSUpdate(profile, profileCid)
		fakeTl.ipfs.updateDelegateEntry(profile, profileCid)
	} else {
		log.Printf("not doing updateDelegateEntry, maybe we can do ipns stuff? do we have the key?")
		privkey, err := getRSAPrivatekeyFromB64(args.Privkey)
		if err != nil {
			log.Printf("rsa privkey extract err")
			log.Print(err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		Crypter.writeBinaryIPFSRsaKey(privkey, profile.Id)
		fakeTl.ipfs.updateNonDelegateEntry(profile, profileCid)
		//fakeTl.ipfs.addPrivKeyIPNSPublish(privkey, profile.Id, profileCid)
	}

	//if err != nil {
	//	log.Println("publish graphnode to ipfs err:", err)
	//	w.WriteHeader(http.StatusInternalServerError)
	//	return
	//}

	log.Printf("method 3 finish well")
	log.Printf("so ... now profile is published to %s... no ipns for it tho.", profileCid)
	log.Printf("lol maybe we can get the browser to sign ipns entry too hahaha. i'm sure it would be possible but delegating it will be a lot faster to figure out.")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(profileCid))
	//fmt.Fprintf(w, "Category: %v\n", vars["category"])
}

type UpdateProfileCidJsonArgs struct {
	ProfileJson string
	ProfileTip string
}
func (s *APIService) updateProfileCid(w http.ResponseWriter, r *http.Request) {
	var err error
	log.Printf("updateProfileCid 3 start")
	args := &UpdateProfileCidJsonArgs{}
	err = json.NewDecoder(r.Body).Decode(&args)
	_ = err
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("%#v", args)

	profile := &Profile{}
	err = json.Unmarshal([]byte(args.ProfileJson), profile)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	pubkeyInterface, err := x509.ParsePKIXPublicKey(profile.Pubkey)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	pubkey, ok := pubkeyInterface.(*rsa.PublicKey)
	if !ok {
		log.Println("Problem asserting pubkey to *rsa.PublicKey")
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	fakeTl := &Timeline{
		crypter: Crypter,
		ipfs:    IPFS,
	}
	validSig, err := fakeTl.checkProfileSignature(profile, pubkey)
	if err != nil || !validSig {
		log.Printf("invalid signature :(")
		log.Print(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	//// MAJOR TODO: accept a signature arg which should be a sig for the args.ProfileTip+our delegate name, and only accept the update if that is valid.

	//dont really need to be doing this but ... why not ... we arent publishing the post content or graphnode stuff but why not this ... also i want to see that i get the same cid from both publishes here and in the client.
	profileCidFromOurPublish := fakeTl.publishProfileToIPFS(profile) //TODO this should also return an err like the other publish

	//cache the cid we were told by the client tho
	fakeTl.ipfs.updateCacheEntry(profile, args.ProfileTip)
	if profile.IPNSDelegate != nil {
		//fakeTl.publishDelegatedIPNSUpdate(profile, profileCid)
		fakeTl.ipfs.updateDelegateEntry(profile, args.ProfileTip)
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(profileCidFromOurPublish))
}

func (s *APIService) IPNSDelegateName(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, ipfsName, err := IPFS.getIPNSDelegateName()
	if ipfsName == "" || err != nil {
		w.Write([]byte("Not available"))
		return
	}
	w.Write([]byte(ipfsName))
}
func (s *APIService) peerId(w http.ResponseWriter, r *http.Request) {
	//I figured out how to do this in the browser so its kind of deprecated now.
	pubkeyB64 := r.Header.Get("X-Pubkey-B64")
	if pubkeyB64 == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	pubkey, err := getRSAPubkeyFromB64(pubkeyB64)
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	profileId := Crypter.getPeerIDBase58FromPubkey(pubkey)
	if profileId == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(profileId))
}

type GetHistoryArgs struct {
	Pubkey     string `json: "pubkey"`
	ProfileTip string `json:"profiletip"`
}

func (s *APIService) history(w http.ResponseWriter, r *http.Request) {
	args := &GetHistoryArgs{}
	err := json.NewDecoder(r.Body).Decode(&args)
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	pubkey, err := getRSAPubkeyFromB64(args.Pubkey)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	fakeTl := &Timeline{ //just for util funcs ... maybe they dont belong where they are
		crypter:   Crypter,
		ipfs:      IPFS,
		profileId: Crypter.getPeerIDBase58FromPubkey(pubkey),
	}
	log.Printf("history for profileId %s", fakeTl.profileId)
	fakeTl.profile, err = fakeTl.fetchCheckProfile(fakeTl.profileId, &args.ProfileTip)
	log.Printf("fakeTl.profile: %#v", fakeTl.profile.follows)
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	err = fakeTl.LoadHistory()
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	tlLinesJson, err := json.Marshal(fakeTl.generateTimeline())
	if err != nil {
		log.Println(err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.Write(tlLinesJson)
}

type ProfileBestTipJsonArgs struct {
	ProfileId string `json: "profileId"`
}

func (s *APIService) profileBestTipCid(w http.ResponseWriter, r *http.Request) {
	args := &ProfileBestTipJsonArgs{}
	err := json.NewDecoder(r.Body).Decode(&args)
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	log.Printf("profileBestTipCid here to get best tip for profile id %s", args.ProfileId)

	// check cache before federation
	profileCidPtr, _ := IPFS.determineProfileCid(args.ProfileId)
	if profileCidPtr == nil {
		profileCidPtr = Federation.Get(args.ProfileId)
	}
	if profileCidPtr == nil {
		log.Println(err)
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(*profileCidPtr))
}


func (s *APIService) profileBestTip(w http.ResponseWriter, r *http.Request) {
	args := &ProfileBestTipJsonArgs{}
	err := json.NewDecoder(r.Body).Decode(&args)
	if err != nil {
		log.Println("decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	// check cache before federation
	profileCidPtr, _ := IPFS.determineProfileCid(args.ProfileId)
	if profileCidPtr == nil {
		profileCidPtr = Federation.Get(args.ProfileId)
	}
	if profileCidPtr == nil {
		log.Println(err)
		w.WriteHeader(http.StatusNotFound)
		return
	}
	profileBytes, err := IPFS.getCidFileBytes(*profileCidPtr)
	if err != nil {
		log.Println("profile data obtainment error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	profile := &Profile{}
	err = json.Unmarshal(profileBytes, profile)
	if err != nil {
		log.Println("profile data decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	type bestTipResponse struct {
		ProfileData Profile
		ProfileCid  string
	}
	outBytes, err := json.Marshal(&bestTipResponse{*profile, *profileCidPtr})
	if err != nil {
		log.Println("profile data decode error:", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(outBytes)
}
