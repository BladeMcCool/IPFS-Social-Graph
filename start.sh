#!/bin/bash
set -e

args=("$@")
cmd=$@

case $1 in

build)
  set -ex
  cd src
  go build -o ../bin/ciddag
  ;;

*)
  ./bin/ciddag
#  exec ${cmd}
  ;;
esac
