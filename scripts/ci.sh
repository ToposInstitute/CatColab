#!/usr/bin/env bash

cd catlog

rustup update ${{ matrix.toolchain }} && rustup default ${{ matrix.toolchain }}
cargo build --verbose
cargo test --verbose
