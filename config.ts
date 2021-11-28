module.exports = {
    auth: {
        uri: process.env.REQ_AUTH_URI,
        apiKey: process.env.REQ_AUTH_API_KEY,
        secret: process.env.REQ_AUTH_SECRET,
        token: process.env.REQ_AUTH_TOKEN
    },
    port: process.env.PORT || 4000,
}