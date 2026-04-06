FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

# Run directly via TSX to avoid ESModule .js extension issues natively
CMD ["npm", "run", "start"]
