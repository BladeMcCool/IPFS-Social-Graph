# IPFS Social Graph  
  
An IPFS Social Graph. Create a social Profile, and use the RSA keys to sign new GraphNodes and Profile versions which link to their previous records immutably. Provide a Web UI to crawl this data using js-ipfs. Provide a server component to federate lists of updated profile tip information among network operators using a go-ipfs instance. 

Watch an early pre-alpha tech demo on Youtube: https://www.youtube.com/watch?v=8DjmmvUvuxE

Live demo: https://ipfstoy.chws.ca
  
### Build / run 
Prequisites: Docker compose for quick start, or Golang 1.15.6 or compatible + existing IPFS node to build and run manually.

Quick start with LetsEncrypt SSL Certs (replace your CIDDAG_WL_PROFILEIDS, CIDDAG_IPNS_FEDERATIONMEMBERS and CIDDAG_TLS_HOSTNAME with correct values, see further below for explanation of what the variables are for):
    
    cd /home/blademccool/IPFS-Social-Graph/
    COMPOSE_FILE=docker-compose.base.yml make build
    COMPOSE_FILE=docker-compose.base.yml CIDDAG_TLS_HOSTNAME=your.server.hostname CIDDAG_WL_PROFILEIDS="QmNMLj7t8VzxmSs7K3xxxxxxxxxxxxxxxxxxxxxxxxxxxj,QmYxxxxxxxxxxxxxxxxxxxxxxEvVMiD5eZMSvuHBwqVXTG" CIDDAG_IPNS_FEDERATIONMEMBERS="QmZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxDgL9jPvb4VBh" make up

Quick start with Self Signed SSL Certs for local testing, will allow anyone with the URL to access it (replace your CIDDAG_IPNS_FEDERATIONMEMBERS with correct values):
    
    cd /home/blademccool/IPFS-Social-Graph/
	openssl ecparam -genkey -name secp384r1 -out server.key
	openssl req -new -x509 -sha256 -key server.key -out server.crt -days 3650
    COMPOSE_FILE=docker-compose.base.yml make build
    COMPOSE_FILE=docker-compose.base.yml CIDDAG_IPNS_FEDERATIONMEMBERS="QmZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxDgL9jPvb4VBh" make up

##### What is CIDDAG_IPNS_FEDERATIONMEMBERS ?
A comma separated list of IPNS names for servers which are publishing lists of profile ids and their best social graph tip node cid info. The server will crawl through the results of all of them and put together a master list of what it thinks is the best (longest) chain of history for a given profileId. Without participating in federation the server will only know about nodes created by its directly connected profile users.

##### What is CIDDAG_WL_PROFILEIDS ?
A comma separated list of ProfileIds which will be used to limit the users who can post updates to their profile tip information through the server. Any profile listed on this WL, or any profile that is followed by any on the wl, will be allowed to post through the server.

#####  What is CIDDAG_TLS_HOSTNAME ?
It would be a domain name that you control which you can point at the IP where you are running the server at and then LetsEncrypt will be able to do some auto-magic to set your TLS certificates up. See comments in code for more info. IMPORTANT: the crypto.subtle api is not available to remote clients without TLS enabled, which is why this is critical that the web ui be served via TLS.

##### Manual build notes (if not doing docker-compose method above.)

Below are using example paths for the project and go resource directories. You will need to fix according to your system. Below we will start an IPFS node which will listen for API on port 7767, get dependencies for the golang project, build the ciddag binary from source using golang 1.15.6 and then run it set to provide a ui via http on port 4588, and to communicate with the running IPFS node on its port 7767. Leave the CIDDAG_TLS_HOSTNAME blank for local http ui on the port specified by CIDDAG_HTTP_PORT container environment var (default 4588). Set a value of a hostname that you control otherwise, and it will do automatic "Let's Encrypt" setup for the TLS cert for the domain. It will NOT WORK over https without a valid cert because otherwise the browser crypto key management api is unavailable.

Start IPFS node:
    
    cd /home/blademccool/IPFS-Social-Graph/;
    COMPOSE_FILE=docker-compose.base.yml docker-compose up -d ipfs0

Build:

    cd /home/blademccool/IPFS-Social-Graph/src;
    GOROOT=/home/blademccool/sdk/go1.15.6 GOPATH=/home/blademccool/go /home/blademccool/sdk/go1.15.6/bin/go get -u ./...;
    GOROOT=/home/blademccool/sdk/go1.15.6 GOPATH=/home/blademccool/go /home/blademccool/sdk/go1.15.6/bin/go build -i -o ciddag .  

Run: 

    CIDDAG_HTTP_PORT=4589 CIDDAG_IPFS_API_SERVER=localhost:7767 CIDDAG_IPFS_KEYSTORE_PATH=./compose/ipfs2/keystore CIDDAG_WL_PROFILEIDS="QmQPy3enk6rHvumMT1u2bnNCEr4QoBiqU2EHXaRUVxmw5p,Qmd7Scc5K1B8JLNoMS4cKATQKemAoSaEq7nFc5b3oQ9F3M" ./ciddag 

Symlink for project code in go: If there are issues building, please try creating a symlink for the name the project is using internally in your gopath src dir, and then attempt the build again.
    
    eg: ln -s /path/to/project/src /yourgopath/src/github.com/blademccool/ciddag
 

Re-Bundling js (example for one of the many used libs, if desired):

    cd /home/blademccool/IPFS-Social-Graph/web
    browserify peerutil.js -r -s peerutil -o lib/peerutil.bundle.js

  
### State of the code  
  
This is an experimental proof of concept written in a hurry. I welcome any and all improved reorganization and cleanup pull requests that make sense.  
  
Some things that I know are issues:  
  - golang test suite is not too comprehensive, and may need some local configuration related tweaks to pass all tests
  - javascript test suite does not exist   
 - no limits on data field sizes or validation for their formatting, some should be imposed  
 - lots of junk commented out code all over
 - not using the native IPFS DAG/IPLD concept. I suspect the benefits to doing so may include needing less spidering and verifying code for cids as well as possible performance improvements.  
 - code can be better organized. some functions are probably in structs or files which are less appropriate than ideal.
 - everything is all in main package right now  
 - code is quite coupled making mocking for tests a challenge.