package main

import (
	"fmt"
	shell "github.com/ipfs/go-ipfs-api"
	"log"
	"os"
	"strings"
	"sync"
)

func main() {
	log.Printf("Starting IPFS Social Graph Server ...")
	service := &APIService{
		TimeService: &defaultTimeService{},
		WlProfileIds: map[string]bool{},
		BaseWlProfileIds: map[string]bool{},
		WlProfileIdMutex: sync.RWMutex{},
		ListenPort: getServiceHttpListenPort(),
		BaseWlProfileIdList: getWlBaseProfileIdList(),
	}
	initializers()
	go IPFS.StartIPNSPeriodicUpdater()
	go service.setupWl()
	go func() {
		//these are each going to do IPNS stuff so dont want them running concurrently. (just seems to lead to context timeouts)
		Federation.Init()
		service.setupExtendedWl()
		Federation.RunBackgroundUpdateFetcherProcessor()
	}()
	service.Start()
}

func initializers() {
	IPFS.InitProfileCache()
	Trash.prepareDumpsterToReceiveTrash()

	IPNSDelegateName := IPFS.getIPNSDelegateName()
	Federation = IPNSDelegateFederation{
		ipnsName: *IPNSDelegateName,
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
	IPNSDelegateKeyName: "ipnsdelegate2",
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
		log.Printf("CIDDAG_WL_PROFILEIDS should list at least one profileid (csv list)")
		os.Exit(1)
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

func checkError(err error) {
	if err != nil {
		fmt.Println("Fatal error ", err.Error())
		os.Exit(1)
	}
}
