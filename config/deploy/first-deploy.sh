#! /bin/bash

# create project archive
tar -czf project.tar.gz --exclude='node_modules' --exclude='._.DS_Store' --exclude='.DS_Store' --exclude='.next' --exclude='.git' --exclude='project.tar.gz' .

# copy to enola server
scp project.tar.gz root@213.171.8.18:/root/projects/backend

# delete src remotely
ssh root@213.171.8.18 'rm -rf /root/projects/backend/src'

# unarchive file remotely
ssh root@213.171.8.18 'tar -xzf /root/projects/backend/project.tar.gz -C /root/projects/backend'

# delete file remotely
ssh root@213.171.8.18 'rm /root/projects/backend/project.tar.gz'

# delete file locally
rm project.tar.gz

# create .env.production file on server
ssh root@213.171.8.18 'cd /root/projects/backend && cp env.production.template .env.production'

# off docker container
ssh root@213.171.8.18  'cd /root/projects/backend && docker-compose down'

# up new version
ssh root@213.171.8.18  'cd /root/projects/backend && docker-compose -f docker-compose.yml  -f docker-compose.prod.yml up -d --build'

# clear none images
ssh root@213.171.8.18  'docker image prune'