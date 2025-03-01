#!/usr/bin/env bash

KERNEL_NAME="julia-1.11"
#KERNEL_NAME="julia-ajaas-1.11"

ORIGIN="http://localhost:5173"

jupyter server \
    --IdentityProvider.token="" \
    --ServerApp.disable_check_xsrf=True \
    --ServerApp.allow_origin="$ORIGIN" \
    --ServerApp.allow_credentials=True \
    --MultiKernelManager.default_kernel_name="$KERNEL_NAME"
