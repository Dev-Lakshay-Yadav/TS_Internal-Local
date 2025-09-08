let my_io = null;

function setIO(io) {
  my_io = io;
}

function getIO() {
  return my_io;
}

module.exports = { setIO, getIO };