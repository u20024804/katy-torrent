var createTorrent = require('create-torrent')
var get = require('simple-get')
var debug = require('debug')
var listify = require('listify')
var path = require('path')
var throttle = require('throttleit')
var thunky = require('thunky')
var uploadElement = require('upload-element')
var xhr = require('xhr')
var $ = require('jquery')
var moment = require('moment')
var WebTorrent = require('webtorrent')
var Datastore = require('nedb');  

// Path where the torrent list will be stored
var torrent_db = new Datastore({ filename: '../data/torrents.db', autoload: true });

var util = require('util')

var client = new WebTorrent()

// HTML elements
var $body = document.body
var torrent_counter = 0
var torrent_db_counter = 0
var torrent_total = 0
var cut_off = 0
var torrent_number = 0
var torrents_loading = 0

// Fetch torrents at startup from database
if (cut_off == 0) {
  torrent_db.find({ number: { $gt: 0 }}, function(err, docs) {  
      if (err) return util.error(err);
      docs.forEach(function(d) {
          console.log('Found torrent: ', d.number);
	      torrent_db_counter = torrent_db_counter + 1;
		  downloadTorrent(d.torrent_url);
      });
  });
}

// Seed via upload input element
var upload = document.querySelector('input[name=upload]')
uploadElement(upload, function (err, files) {
  if (err) return util.error(err)
  files = files.map(function (file) { return file.file })
  onFiles(files)
})

// Download via input element
document.querySelector('form').addEventListener('submit', function (e) {
  var query_torrent_id = document.querySelector('form input[name=torrentId]').value.trim()
  e.preventDefault()
  downloadTorrent(query_torrent_id)
})

// Warn when leaving and there are no other peers
window.addEventListener('beforeunload', onBeforeUnload)

// File is a torrent file
function isTorrentFile (file) {
  var extname = path.extname(file.name).toLowerCase()
  return extname === '.torrent'
}

// File is not a torrent file
function isNotTorrentFile (file) {
  return !isTorrentFile(file)
}

// Downloading torrent from magnet link
function downloadTorrent (torrentId) {
  util.log('Downloading torrent from ' + torrentId)
  torrents_loading = torrents_loading + 1
    client.add(torrentId, onTorrent)
}

// downloading torrent from .torrent file
function downloadTorrentFile (file) {
  util.log('Downloading torrent from <strong>' + file.name + '</strong>')
    //writeTorrentTable(file.name)
    client.add(file, onTorrent)
}

// Seeding
function seed (files) {
  if (files.length === 0) return
  util.log('Seeding ' + files.length + ' files');
  writeTorrentTable(file.name);
  client.seed(files, onTorrent);
}

// Universal table writing function
//function writeTorrentTable (torrentGiven) {
//}

// Universal torrent loading function
function onTorrent (torrent) {

  $('#loading_span_value').html(torrents_loading)
	
  //Increase global torrent count
  torrent_counter = torrent_counter + 1;
  $('#torrent_counter').html(torrent_counter)
  torrent_number = '' + torrent_counter.toString()

  // Values to be added to database
  var torrent_list_entry = {
      type: 'torrent',  
      number: torrent_counter,
      torrent_url: torrent.magnetURI
  };

  // Create the row in the torrent list table with new torrent data
  $('#torrent_list').append('<tr>')
  $('#torrent_list').append('<td class="tg-yw4l" id="name_' + torrent_number + '" style="overflow: hidden; max-width: 200px">' + torrent.magnetURI + '</td>')
  $('#torrent_list').append('<td class="tg-yw4l" id="numPeers_' + torrent_number + '"></td>')
  $('#torrent_list').append('<td class="tg-yw4l" id="downloadedTotal_' + torrent_number + '">0</td>')
  $('#torrent_list').append('<td class="tg-yw4l" id="remaining_' + torrent_number + '">Loading...</td>')
  $('#torrent_list').append('<td class="tg-yw4l" id="downloadSpeed_' + torrent_number + '">0</td>')
  $('#torrent_list').append('<td class="tg-yw4l" id="uploadSpeed_' + torrent_number + '">0</td>')
  $('#torrent_list').append('<td class="tg-yw4l" id="torrentMagnetLink_' + torrent_number + '">Unknown</td>')
  $('#torrent_list').append('</tr>')

  //var $progressBar = document.querySelector('#progressBar_' + torrent_counter.toString())
  var $name = document.querySelector('#name_' + torrent_number)
  var $numPeers = document.querySelector('#numPeers_' + torrent_number)
  var $downloadedTotal = document.querySelector('#downloadedTotal_' + torrent_number)
  var $remaining = document.querySelector('#remaining_' + torrent_number)
  var $uploadSpeed = document.querySelector('#uploadSpeed_' + torrent_number)
  var $downloadSpeed = document.querySelector('#downloadSpeed_' + torrent_number)
  var $torrentMagnetLink = document.querySelector('#torrentMagnetLink_' + torrent_number) 

    // Save torrent data to database
  if (torrent_counter > torrent_db_counter) {
    torrent_db.insert(torrent_list_entry, function(err, doc) {  
        console.log('Inserted', doc.torrent_url, 'with ID', doc.number);
	cut_off = 1;
    });
  }
  
  // Trigger statistics refresh
  torrent.on('done', onDone)
  setInterval(onProgress, 500)
  onProgress()

  // Statistics
  function onProgress () {
    // Peers
    $numPeers.innerHTML = torrent.numPeers

    // Progress
    var percent = Math.round(torrent.progress * 100 * 100) / 100
    //$progressBar.style.width = percent + '%'
    $downloadedTotal.innerHTML = prettyBytes(torrent.downloaded) + ' / ' + prettyBytes(torrent.length)

    // Remaining time
    var remaining
    if (torrent.done) {
	  torrents_loading = torrents_loading - 1;
      remaining = 'Done.'
    } else {
      remaining = moment.duration(torrent.timeRemaining / 1000, 'seconds').humanize()
      remaining = remaining[0].toUpperCase() + remaining.substring(1)
    }
    $remaining.innerHTML = remaining

    // Speed rates
    $downloadSpeed.innerHTML = prettyBytes(torrent.downloadSpeed) + '/s'
    $uploadSpeed.innerHTML = prettyBytes(torrent.uploadSpeed) + '/s'
  }

  function onDone () {
    $body.className += ' is-seed'
    onProgress()
  }
  
  //Add torrent magnet link to table
  $torrentMagnetLink.innerHTML = '<a href="' + torrent.magnetURI + '">Magnet Link</a>'
  
  torrent.files.forEach(function (file) {
    $name.innerHTML = file.name
  })  
}

// File handling function
function onFiles (files) {
  debug('got files:')
  files.forEach(function (file) {
    debug(' - %s (%s bytes)', file.name, file.size)
  })

  // .torrent file = start downloading the torrent
  files.filter(isTorrentFile).forEach(downloadTorrentFile)

  // everything else = seed these files
  seed(files.filter(isNotTorrentFile))
}

// Check to see if there's torrents being seeded, warn user not to leave if there's no peers (BUGGY!)
function onBeforeUnload (e) {
  if (!e) e = window.event

  if (!window.client || window.client.torrents.length === 0) return

  var isLoneSeeder = window.client.torrents.some(function (torrent) {
    return torrent.swarm && torrent.swarm.numPeers === 0 && torrent.progress === 1
  })
  if (!isLoneSeeder) return

  var names = listify(window.client.torrents.map(function (torrent) {
    return '"' + (torrent.name || torrent.infoHash) + '"'
  }))

  var theseTorrents = window.client.torrents.length >= 2
    ? 'these torrents'
    : 'this torrent'
  var message = 'You are the only person sharing ' + names + '. ' +
    'Consider leaving this page open to continue sharing ' + theseTorrents + '.'

  if (e) e.returnValue = message // IE, Firefox
  return message // Safari, Chrome
}

// Human readable bytes util
function prettyBytes(num) {
  var exponent, unit, neg = num < 0, units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  if (neg) num = -num
  if (num < 1) return (neg ? '-' : '') + num + ' B'
  exponent = Math.min(Math.floor(Math.log(num) / Math.log(1000)), units.length - 1)
  num = Number((num / Math.pow(1000, exponent)).toFixed(2))
  unit = units[exponent]
  return (neg ? '-' : '') + num + ' ' + unit
}

