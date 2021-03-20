package main

import (
	"fmt"
	shell "github.com/ipfs/go-ipfs-api"
	"log"
	"os"
	"strings"
)

func main() {
	log.Printf("Starting IPFS Social Graph Server ...")
	lister := &Lister{
		BaseWlProfileIdList: getWlBaseProfileIdList(),
		CuratedProfileIdList: getCuratedProfileIdList(),
	}
	service := &APIService{
		TimeService:         &defaultTimeService{},
		Lister: lister,
		ListenPort:          getServiceHttpListenPort(),
		TLSHostName:         getTLSHostName(),
		TLSDataDir: getTLSDataDir(),
		RecaptchaSecretKey: getRecaptchaSecretKey(),
		RecaptchaSiteKey: getRecaptchaSiteKey(),
	}
	initializers()
	go IPFS.StartIPNSPeriodicUpdater()
	service.Lister.setupWl()
	service.Lister.setupBl(service.TLSDataDir)
	go func() {
		//these are each going to do IPNS stuff so dont want them running concurrently. (just seems to lead to context timeouts)
		Federation.setLister(lister)
		Federation.Init()
		go service.Lister.setupExtendedWl(service)
		log.Printf("Federation membership size: %d", len(Federation.Members))
		go Federation.RunBackgroundUpdateFetcherProcessor()
	}()
	service.Start()
}

func initializers() {
	IPFS.InitProfileCache()
	err := IPFS.InitDelegateName()
	if err != nil {
		panic(fmt.Sprintf("startup failure: %s", err.Error()))
	}

	Trash.prepareDumpsterToReceiveTrash()
	Federation = IPNSDelegateFederation{
		ipnsName: IPFS.IPNSDelegateName,
		publishChannelName: IPFS.IPNSDelegateLegacyName,
		memberNames: getIPNSFederationMembernames(),
		ipfs: IPFS,
	}

}
var UtilityTimeline = &Timeline{
	crypter: Crypter,
	ipfs: IPFS,
}

var IPFS = &IPFSCommunicator{
	shell: shell.NewShell(getIpfsApiServerConnectionInfo()),
	//IPNSDelegateExpectPublishName: Crypter.getIPNSExpectNameFromDefaultServerConfigKeyNoErr(),
	//IPNSDelegateKeyName: "ipnsdelegate2",
}
var Crypter = &CryptoUtil{
	ipfsKeystorePath: getIpfsKeystorePath(),
}
var Trash = &Trashcan{}

func getIpfsApiServerConnectionInfo() string {
	val, ok := os.LookupEnv("CIDDAG_IPFS_API_SERVER")
	if !ok {
		log.Printf("CIDDAG_IPFS_API_SERVER needs to be set with host:port for IPFS api")
		os.Exit(1)
	}
	return val
}

func getIpfsKeystorePath() string {
	val, ok := os.LookupEnv("CIDDAG_IPFS_KEYSTORE_PATH")
	if !ok {
		log.Printf("CIDDAG_IPFS_KEYSTORE_PATH should indicate the path to the ipfs keystore")
		os.Exit(1)
	}
	if _, err := os.Stat(val); os.IsNotExist(err) {
		log.Printf("CIDDAG_IPFS_KEYSTORE_PATH specified path %s does not exist", val)
		os.Exit(1)
	}
	if string(val[len(val)-1]) == "/" {
		val = val[:len(val)-1]
	}
	return val
}

func getWlBaseProfileIdList() []string {
	val, ok := os.LookupEnv("CIDDAG_WL_PROFILEIDS")
	if !ok {
		log.Printf("note: missing CIDDAG_WL_PROFILEIDS")
		return []string{}
		//os.Exit(1)
	}
	if val == "" { return nil }
	return strings.Split(val, ",")
}

func getCuratedProfileIdList() []string {
	val, ok := os.LookupEnv("CIDDAG_CURATED_PROFILEIDS")
	if !ok {
		return []string{}
	}
	if val == "" { return nil }
	return strings.Split(val, ",")
}

func getIPNSFederationMembernames() []string {
	val, ok := os.LookupEnv("CIDDAG_IPNS_FEDERATIONMEMBERS")
	if !ok {
		return nil
	}
	if val == "" { return nil }
	return strings.Split(val, ",")
}

func getServiceHttpListenPort() string {
	val, ok := os.LookupEnv("CIDDAG_HTTP_PORT")
	if !ok {
		log.Printf("CIDDAG_HTTP_PORT should be set with a port value")
		os.Exit(1)
	}
	return val
}
func getTLSHostName() string {
	val, ok := os.LookupEnv("CIDDAG_TLS_HOSTNAME")
	if ok {
		return val
	}
	return ""
}
func getTLSDataDir() string {
	val, ok := os.LookupEnv("CIDDAG_TLS_DATADIR")
	if ok {
		return val
	}
	return ""
}

func getRecaptchaSecretKey() string {
	val, ok := os.LookupEnv("RECAPTCHA_SECRETKEY")
	if ok {
		return val
	}
	return ""
}
func getRecaptchaSiteKey() string {
	val, ok := os.LookupEnv("RECAPTCHA_SITEKEY")
	if ok {
		return val
	}
	return ""
}

func checkError(err error) {
	if err != nil {
		fmt.Println("Fatal error ", err.Error())
		os.Exit(1)
	}
}
