FROM golang:1.15.8-buster
 ENV GO111MODULE=on
 WORKDIR /go/src
 RUN git clone https://github.com/BladeMcCool/IPFS-Social-Graph
 WORKDIR /go/src/IPFS-Social-Graph/src
 RUN go get
 RUN go build -o ../ciddag
 WORKDIR /go/src/IPFS-Social-Graph/
 EXPOSE 4588
 CMD ["ciddag"]
