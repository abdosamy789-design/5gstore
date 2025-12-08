#!/bin/bash
cd /home/ubuntu/nextjs_project
npm uninstall @prisma/cli
npm install prisma --save-dev
npx prisma migrate dev --name init
