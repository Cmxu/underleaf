FROM ubuntu:22.04
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y texlive-full && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /workdir
CMD ["bash"]
