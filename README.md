
# IPFS Social Graph  
  
An IPFS Social Graph. The intent is to build an ecosystem.  

### Proof of Concept  
  
This is an experimental proof of concept, to verify if the idea works and if IPFS delivers on its promises. It has also been written in haste, as time is apparently of the essence.
  
### Build / run 
Prequisites: Docker compose for quick start, or Golang 1.15.6 or compatible + existing IPFS node to build and run manually.

Quick start with LetsEncrypt SSL Certs (replace your CIDDAG_WL_PROFILEIDS, CIDDAG_IPNS_FEDERATIONMEMBERS and CIDDAG_TLS_HOSTNAME with correct values):
    
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
It would be a domain name that you control which you can point at the IP where you are running the server at and then LetsEncrypt will be able to do some auto-magic to set your TLS certificates up. See comments in code for more info.

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
 

Re-Bundling js (if desired):

    cd /home/blademccool/IPFS-Social-Graph/web
    browserify peerutil.js -r -s peerutil -o lib/peerutil.bundle.js
    
  
### Motivation  
  
To be able to communicate freely without having terms imposed.  
  
### Own your data  
  
If you run this and point it at an IPFS node that you control, then you own and control your data, up to the point that you give a copy of it freely to others, who may choose to archive it indefinitely. Anything you do or say on this social graph may stick around to haunt you. Protect your private key, it is your identity. If you lose it, you can no longer update your profile or social graph. If it is compromised, there is no authority which can intervene.  
  
### RSA Cryptography (Sign/Verify primarily)  
  
Your identity is an RSA public key, which is derived from a RSA private key. When you wish to publish updates, your private key will be used locally in the browser to sign messages that are also published by js-ipfs in the browser. At the moment all post creation is done in cleartext but I see no reason why future developments could not use similar/same RSA keys to encrypt messages intended only for certain recipients.  
  
### IPNS Publish limitations and security of Private Key  
  
From my experience the js-ipfs library is not able to push our IPNS published records in a way that other IPFS nodes on the internet are able to resolve the names. In order for the server to publish an IPNS name on your behalf using your own peerId you are required to send the private key to the server. This is incredibly insecure, and IPNS publish is too slow to allow this. So, the alternative is IPNS Delegated Federation, where the server will publish a list of profileId social graph tips on behalf of all clients in a single large list, and collect similar lists from other servers in the federation.  
  
### Notes on Anonymity   
Your anonymity is up to you. I have made no effort to put services behind Tor or I2P or whatever. I have made no effort to encrypt any of the text produced by this code to be stored in IPFS. If you are under threat by powerful entities then you will need to take your own steps to shroud your communication with this system. Technically the only identifying information that a server requires to process your request is a whitelisted public RSA key. I would think that accessing this service via a Tor exit should sufficiently obfuscate your traffic origin.  
 
### TODOs / ideas for the future   
 - ~~Improve UI, ux, layout/design etc as well as the possibility to make use of the js-ipfs library to load cid data and move timeline assembly code from the server to the browser, which could make the experience much more dynamic!~~ [Implemented a much better UI than initial release!]  
  
 - Delete / ~~Retract posts.~~ [Impl] Since the history is published to anyone who cares to crawl it, there is no real concept of being able to permanently delete something however it should be trivial to republish your entire profile history back to the beginning and just leave out anything that you want to 'go away' from your current official timeline of posts. ~~A retraction would operate not by trying to rewrite history but instead by adding a new entry flagging an old one as retracted.~~ [Now Implemented] 'Edits' to existing posts could be published in a similar fashion just by using diffs and leave it to client code to assemble the current rendition of the text.
  
 - ~~Federation of IPNS delegates. basically you'd just list peerIds of the federation members (peer id of their 'IPNS delegate' key) you want to join with, and it will collect all the profileid tip info published by the collective membership.~~ [Now implemented -- including pubsub enhancement ]  
  
 - ~~Repost function, which would be a profile making a post that references another post, this would let profiles in your graph expose you to profiles that are outside of it.~~ [Now implemented]
   
 - ~~'Follow' button for the profileId shown in these reposts. The server would need to go collect profile info to present a display name etc on the reposted content, but could allow it to appear without that too i suppose.~~ [Now implemented]   
  
 - Likes - which by the nature of the system would only be able to count up a total of likes done to your content by people in your social graph.  
  
 - Groups / "Curated Feeds" - likely requiring new data structure. Haven't put too much thought into it, but a hierarchy of profileIds could have authority to publish the canonical official history of a given group, thus allowing them moderation power to disappear posts in the group as desired.  
  
 - Blacklisting services with blacklist of post content cids. Multiple blacklists could be subscribed to, it would just put all the cids on one master block list. Could manually exclude things of interest if the subscribed block lists are too aggressive.  
  
 - "Verification" services which would require some kind of identification vetting process and then be willing to sign off on some profileId as being "verified". Different levels and quality of verification can be provided by different providers and it would be up to the clients which verification services they want to trust the opions of and to what degree.
 
 - Timestamp oracles, as right now the timestamps on posts are self generated and could claim to be from the future or the past. The graphnode sequencing and reply inter-relations between graph chains will currently provide some relative time meta info, but having a recognized service available which could add its signature of validity to specific post timestamps could provide better assurances for correct message ordering in a timeline display.
 
 - Moderation subscription? you would not see any new content until it had been approved by a moderation team/group of your choosing. 
  
 - Centralized portals? Where you would retain your private key for signing things in the browser client but the timeline presented to you is curated or managed by a service with terms. If you were unhappy with those terms at any point you could just go use an independent client or a different centralized portal using your keys. Centralized portals could even offer you the sacrifice of managing your keys for you, at the expense of you no longer truly owning your data. However for some people, this may be close to the the desired experience. Such centralized platforms could also possibly offer monetization paths.  
  
### Inspirational References  
  
https://beyermatthias.de/blog/2017/10/31/blueprint-of-a-distributed-social-network-on-ipfs---and-its-problems/  
https://carter.sande.duodecima.technology/decentralized-wishlist/  
Plus the writings of Larry Sanger and others.  
  
### Special Thanks to
   Matthias Beyer - For writing his blog post, helping me realize I'm not the first person to think of this (seemingly obvious) solution to the problem, and for thinking of a bunch of stuff that I was not.
   
   Larry Sanger - For inspiration to actually do something.
   
   Ian Crossland and Tim Pool - For constantly complaining about the lack of something like this existing
   
   Kibbychan - For putting up with all my bullshit. 

### Support libraries, standing on the shoulders of giants
 None of this would be possible without the following critical libraries and apis which this project relies on
   - go-ipfs
   - go libp2p
   - js-ipfs
   - crypto.subtle
   - js libp2p
   - localforage
   - stablejson
   - jdenticon
   - moment.js
   
   and so many more. 

### Story Time  
  
An idea occurred to me to have a chain of posts that could be crawled back to its origin, and that posts within that chain could reference existing posts in other chains, creating a sort of interlinked DAG of social graph, and that this could be published on top of IPFS for distribution and be secured by RSA crypto keys for pubkey identity and message signing. I wanted to see if this could work so I built this proof of concept.  
  
The main two data structures in this are the GraphNodes and the Profiles. They link to each other and create a history. Each time a profile wants to publish new content it has to update its social graph tip information for its profile so that the latest content can be found, and that new update will link back to prior content.   
  
I wanted a profile identity to be an RSA public key and to use digital signatures to verify the content is created by the claimed profile owner. I understood that IPNS would be a way to keep the social graph tip up to date, but encountered a problem in doing so via the js-ipfs library in-browser, related to dht support, and thus the motivation for the server component.  
  
The server is intended to allow you to publish IPNS updates and otherwise cache profile tip information when being used by authorized clients. Unfortunately to be able to publish IPNS under your own private key, it has to be sent to the server. Since that is effectively unacceptable, I have implemented some ideas for a federated listing service that can provide the required information to keep clients of participating servers up to date.  
  
There is a minimal proof of concept UI as well as some web server methods built around serving that ui. This ui allows you to generate RSA private key in the browser and use it to sign and publish messages into IPFS directly from the browser using js-ipfs. It will also send a signed update of profile tip information to the server for it to publish in its IPNS delegated listings and server-to-server pubsub for federated information sharing.   
  
Watch a demo on Youtube: https://www.youtube.com/watch?v=8DjmmvUvuxE

Play with it live: https://ipfstoy.chws.ca 
  
### State of the code  
  
This is an experimental proof of concept written in a hurry. I welcome any and all improved reorganization and cleanup pull requests that make sense.  
  
Some things that I know are issues:  
  - golang test suite is not too comprehensive, and may need some local configuration related tweaks to pass all tests
  - javascript test suite does not exist   
 - no limits on data field sizes or validation for their formatting, some should be imposed  
 - lots of junk commented out code all over
 - not using the native IPFS DAG/IPLD concept. I suspect the benefits to doing so may include needing less spidering and verifying code for cids as well as possible performance improvements.  
 - code can be better organized. some functions are probably in structs which are less appropriate than ideal
 - everything is all in main package right now  
 - code is quite coupled making mocking for tests a challenge.