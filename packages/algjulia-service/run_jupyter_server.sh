#!/bin/bash

jupyter server --ServerApp.token="" --ServerApp.disable_check_xsrf=True --ServerApp.allow_origin="http://localhost:5173" --ServerApp.allow_credentials=True
