#!/bin/bash
set -e

gobuild () {
  cd src
  go build -o ../bin/ciddag
  cd ..
}

args=("$@")
cmd=$@

case $1 in

gobuild)
  set -ex
  gobuild
  ;;

*)
  if [ ! -f "./bin/ciddag" ]; then
    echo "binary does not exist -- building it"
    gobuild
  fi
  ./bin/ciddag
#  exec ${cmd}
  ;;
esac
