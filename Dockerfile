FROM golang:1.15.8-buster
ENV GO111MODULE=on
# WORKDIR /go/src
# RUN git clone https://github.com/BladeMcCool/IPFS-Social-Graph
# WORKDIR /go/src/IPFS-Social-Graph/src
WORKDIR /go/src/IPFS-Social-Graph/
COPY ./src ./src
COPY ./bin ./bin
COPY ./web ./web
COPY start.sh .
WORKDIR /go/src/IPFS-Social-Graph/src
RUN go get
#RUN go build -o ../bin/ciddag
WORKDIR /go/src/IPFS-Social-Graph/
EXPOSE 4588
EXPOSE 80
EXPOSE 443
#CMD ["ciddag"]
ENTRYPOINT ["./start.sh"]