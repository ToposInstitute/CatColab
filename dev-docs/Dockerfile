FROM ocaml/opam:alpine-ocaml-5.1-flambda AS forester-builder

RUN sudo apk update

RUN sudo apk add linux-headers

RUN mkdir forester

WORKDIR /home/opam/forester

ADD . .

RUN sudo chown -R opam .

RUN git apply static.patch

RUN opam install dune

RUN opam install --deps .

RUN eval $(opam config env) && dune build

FROM scratch AS forester-built
COPY --from=forester-builder /home/opam/forester/_build/default/bin/forester/main.exe /bin/forester
ENTRYPOINT [ "/bin/forester" ]
