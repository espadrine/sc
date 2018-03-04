// Server demo. `node app [PORT [https]]`
// © 2011-2017 Thaddée Tyl, Jan Keromnes. LGPL.

const port = +process.argv[2] || +process.env.PORT || 1234
let camp = require('./lib/camp.js')
let sc = camp.start({port: port, secure: process.argv[3] === 'https'})
console.log('http://[::1]:' + port)

// Templating demo: /template.html?title=Hello&info=[Redacted].
sc.path('/template.html')

// Templating demo with multiple templates and path parameter.
// /html.template/Hello/World
let flip = sc.template(['web/template.html', 'web/flip.html'])
sc.path('/html.template/:title/:info', (req, res) => {
  res.template(req.data, flip)
})

// Doctor demo: /doctor?text=…
let replies = ['Ok.', 'Oh⁉', 'Is that so?', 'How interesting!',
               'Hm…', 'What do you mean?', 'So say we all.']
sc.post('/doctor', (req, res) => {
  replies.push(req.query.text)
  res.json({reply: replies[Math.random() * replies.length|0]})
})

// Chat demo
let chat = sc.eventSource('/all')
sc.post('/talk', (req, res) => {chat.send(req.data); res.end()})

// WebSocket chat demo
sc.wsBroadcast('/chat', (req, res) => res.send(req.data))

// Socket.io chat demo
const ioChat = sc.io.of('/chat');
ioChat.on('connection', socket =>
  socket.on('message', msg => ioChat.send(msg)));

// Not found demo
sc.notFound('/*.lol', (req, res) => res.file('/404.html'))

// Basic authentication demo
sc.get('/secret', (req, res) => {
  if (req.username === 'Caesar' && req.password === '1234') {
    res.end('Congrats, you found it!')
  } else {
    res.statusCode = 401
    res.setHeader('WWW-Authenticate', 'Basic')
    res.end('Nothing to hide here!')
  }
})

// Low-level handler
sc.handle((req, res, down) => {
  res.setHeader('X-Open-Source', 'https://github.com/espadrine/sc/')
  down()
})
