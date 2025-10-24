#!/bin/bash

# Create project archive excluding unnecessary files
tar -czf project.tar.gz --exclude='node_modules' --exclude='._.DS_Store' --exclude='.DS_Store' --exclude='.next' --exclude='.git' --exclude='project.tar.gz' .

# Copy to server
scp project.tar.gz root@213.171.8.18:/root/projects/backend

# Delete src remotely (if necessary, adjust this based on what you actually need to remove)
ssh root@213.171.8.18 'rm -rf /root/projects/backend/src'

# Unarchive file remotely
ssh root@213.171.8.18 'tar -xzf /root/projects/backend/project.tar.gz -C /root/projects/backend'

# Delete tar file remotely
ssh root@213.171.8.18 'rm /root/projects/backend/project.tar.gz'

# Delete tar file locally
rm project.tar.gz

# Update .env.production file on server if template changed
ssh root@213.171.8.18 'cd /root/projects/backend && cp env.production.template .env.production'

# Stop and remove only the app container
ssh root@213.171.8.18 'cd /root/projects/backend && docker-compose -f docker-compose.yml -f docker-compose.prod.yml stop app && docker-compose -f docker-compose.yml -f docker-compose.prod.yml rm -f app'

# Build and up only the app service
ssh root@213.171.8.18 'cd /root/projects/backend && docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --no-deps app'

# Clear none images (optional but be cautious as this removes all unused images)
ssh root@213.171.8.18 'docker image prune -f'