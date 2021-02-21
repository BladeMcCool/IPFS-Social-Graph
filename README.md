
# IPFS Social Graph  
  
An IPFS Social Graph. The intent is to build an ecosystem.  
  
### Motivation  
  
To be able to communicate freely without having terms imposed.  
  
### Own your data  
  
If you run this and point it at an IPFS node that you control, then you own and control your data, up to the point that you give a copy of it freely to others, who may choose to archive it indefinitely. Anything you do or say on this social graph may stick around to haunt you. Protect your private key, it is your identity. If you lose it, you can no longer update your profile or social graph. If it is compromised, there is no authority that can intervene.  
  
### RSA Cryptography (Sign/Verify primarily)  
  
Your identity is an RSA public key, which is derived from a RSA private key. When you wish to publish updates at the moment, your private key will be used locally in the browser to sign messages that the server will publish on your behalf. At the moment all post creation is done in plain text but I see no reason why future developments could not use similar/same RSA keys to encrypt messages intended only for certain recipients.  
  
### IPNS Publish limitations and security of Private Key  
  
From my experience the js-ipfs library is not able to push our IPNS published records in a way that other IPFS nodes on the internet are able to resolve the names. In order for the server to publish an IPNS name on your behalf using your own peerId you are required to send the private key to the server. This is incredibly insecure. An alternative is to disable sending the private key and to delgate IPNS publishing to a server peerID which can publish a list of all the profile tip information. This delegated IPNS functionality is experimental and offers limited ability to obtain profile data as, at present, only the server maintaining the delegated list will be able to find the profile data in IPFS  
  
### Notes on Anonymity   
Your anonymity is up to you. I have made no effort to put services behind Tor or I2P or whatever. I have made no effort to encrypt any of the text produced by this code to be stored in IPFS. If your government is made up of terrorists then you will need to take your own steps to shroud your communication to any running instance of this server. Technically the only identifying information that a server requires to process your request is a whitelisted public RSA key. I would think that accessing this service via a Tor exit should sufficiently obfuscate your traffic origin.  
  
### Proof of Concept  
  
This is an experimental proof of concept, to verify if the idea works and if IPFS delivers on its promises. Major concerns at present are the need to send private key to the server to do IPNS properly. Perhaps there are better solutions via pubsub or other techniques to share profileTip cid information around.  
  
  
### Build / run 
Prequisites: Golang 1.15.6 or compatible, Docker or existing IPFS node.

Below are using example paths for the project and go resource directories. You will need to fix according to your system. Below we will start an IPFS node which will listen for API on port 7767, get dependencies for the golang project, build the ciddag binary from source using golang 1.15.6 and then run it set to provide a ui via http on port 4589, and to communicate with the running IPFS node on its port 7767   

Start IPFS node:
    
    
    cd /home/blademccool/ciddag/;
    COMPOSE_FILE=docker-compose.base.yml docker-compose up -d ipfs0

Build:
 

    cd /home/blademccool/ciddag/src;
    GOROOT=/home/blademccool/sdk/go1.15.6 GOPATH=/home/blademccool/go /home/blademccool/sdk/go1.15.6/bin/go get -u ./...;
    GOROOT=/home/blademccool/sdk/go1.15.6 GOPATH=/home/blademccool/go /home/blademccool/sdk/go1.15.6/bin/go build -i -o ciddag .  

Run: 
 

    CIDDAG_HTTP_PORT=4589 CIDDAG_IPFS_API_SERVER=localhost:7767 CIDDAG_IPFS_KEYSTORE_PATH=./compose/ipfs2/keystore CIDDAG_WL_PROFILEIDS="QmQPy3enk6rHvumMT1u2bnNCEr4QoBiqU2EHXaRUVxmw5p,Qmd7Scc5K1B8JLNoMS4cKATQKemAoSaEq7nFc5b3oQ9F3M" ./ciddag 

 
 
### TODOs / ideas for the future   
 - Improve UI, ux, layout/design etc as well as the possibility to make use of the js-ipfs library to load cid data and move timeline assembly code from the server to the browser, which could make the experience much more dynamic!  
  
 - Delete / Retract posts. Since the history is published to anyone who cares to crawl it, there is no real concept of being able to permanently delete something however it should be trivial to republish your entire profile history back to the beginning and just leave out anything that you want to 'go away' from your current official timeline of posts. A retraction would operate not by trying to rewrite history but instead by adding a new entry flagging an old one as retracted. 'Edits' to existing posts could be published in a similar fashion just by using diffs and leave it to client code to assemble the current rendition of the text.
  
 - Federation of IPNS delegates. basically you'd just list peerIds of the federation members (peer id of their 'IPNS delegate' key) you want to join with, and it will collect all the profileid tip info published by the collective membership. Then it would be more practical to stop sending private key to server for IPNS purposes.  
  
 - Repost function, which would be a profile making a post that references another post, this would let profiles in your graph expose you to profiles that are outside of it.  
 - 'Follow' button for the profileId shown in these reposts. The server would need to go collect profile info to present a display name etc on the reposted content, but could allow it to appear without that too i suppose.  
  
 - Likes - which by the nature of the system would only be able to count up a total of likes done to your content by people in your social graph.  
  
 - Groups - likely requiring new data structure. Havent put too much thought into it but a hierarchy of profileIds could have authority to publish the canonical offical history of a given group, thus allowing them moderation power to disappear posts in the group as desired.  
  
 - Blacklisting services with blacklist of post content cids. Multiple blacklists could be subscribed to, it would just put all the cids on one master block list. Could manually exclude things of interest if the subscribed block lists are too agressive.  
  
 - Moderation subscription? you would not see any new content until it had been approved by a moderation team/group of your choosing  
  
 - Centralized portals? Where you would retain your private key for signing things in the browser client but the timeline presented to you is curated or managed by a service with terms. If you were unhappy with those terms at any point you could just go use an independent client or a different centralized portal using your keys. Centralized portals could even offer you the sacrifice of managing your keys for you, at the expense of you no longer truly owning your data. However for some people, this may be close to the the desired experience. Such centralized platforms could also possibly offer montetization paths.  
  
### References (inspiration)  
  
https://beyermatthias.de/blog/2017/10/31/blueprint-of-a-distributed-social-network-on-ipfs---and-its-problems/  
https://carter.sande.duodecima.technology/decentralized-wishlist/  
Plus the writings of Larry Sanger and others.  
  
### Technical overview  
  
I had an idea to have a chain of posts that could be crawled back to its origin, and that posts within that chain could reference existing posts in other chains, creating a sort of interlinked DAG of social graph, and that this could be published on top of IPFS for distribution and be secured by RSA crypto keys for pubkey identity and message signing. I wanted to see if this could work so I built this proof of concept.  
  
The main two data structures in this are the GraphNodes and the Profiles. They link to each other and create a history. Each time a profile wants to publish new content it has to update its social graph tip information for its profile so that the latest content can be found, and that new update will link back to prior content.   
  
I wanted a profile identity to be an RSA public key and to use digital signatures to verify the content is created by the claimed profile owner. I understood that IPNS would be a way to keep the social graph tip up to date, but encountered a problem in doing so via the js-ipfs library in-browser, related to dht support, and thus the motivation for the server component.  
  
The server is intended to allow you to publish IPNS updates and otherwise cache profile tip information when being used by authorized clients. Unfortunately to be able to publish IPNS under your own private key, it has to be sent to the server. I have some ideas for a federated listing service though that could provide the required information to keep clients of participating servers up to date  
  
There is a minimal proof of concept UI as well as some web server methods built around serving that ui. If IPNS delegation to the server is used, private key does not need to be sent to the server, but that makes the profile impossible to find except on the one server that knows it exists. If you give the server the private key it can install it into its own IPFS keystore and use it to publish IPNS properly for a given profile. It should be pretty safe to do this if it is running locally but if the server is remote you probably dont want to send it private keys unencrypted without https, and not at all if you don't control it. Also without https between a remote server and the client ui I can imagine some easy mitm attacks.  
  
Otherwise, this ui allows you to generate RSA private key in the browser and use it to sign messages from the server for it to publish on your behalf as i have not made any use of the js-ipfs library in the ui code as of yet.

Watch a demo on Youtube: https://www.youtube.com/watch?v=8DjmmvUvuxE  
  
### State of the code  
  
This is an experimental proof of concept written in a hurry. I welcome any and all improved reorganization and cleanup pull requests that make sense.  
  
Some things that I know are issues:  
  - test suite is not too comprehensive and some tests will fail if run in the wrong order right now i believe   
 - no limits on data field sizes or validation for their formatting, some should be imposed  
 - lots of junk commented out code all over  
 - related functions in stupid order in the files  
 - everything is all in main package right now  
 - probably too coupled