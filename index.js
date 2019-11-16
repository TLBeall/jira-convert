// LIBRARY IMPORTS
// ----------------------------------------------------
const JiraApi = require('jira-client');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');



// MODELS/DATA STRUCTURES AND GLOBAL VARIABLES
// ----------------------------------------------------
class mapObject {
  constructor(ID, LFGKey, LFGStoryPoints, LMKey, points) {
    this.LFGID = ID;
    this.LFGKey = LFGKey;
    this.LFGStoryPoints = LFGStoryPoints;
    this.LMKey = LMKey;
    this.LMStoryPoints = points;
  }
}

class lmObject {
  constructor(key, points) {
    this.LMKey = key;
    this.StoryPoints = points;
  }
}

var LFGIssuesArray = [];
var LMIssuesArray = [];



// CONNECT TO JIRA
// -------------------------------------------------
var jira = new JiraApi({
  protocol: 'https',
  host: '<host>',                                   // ASSIGN JIRA SERVER
  username: '<user>',                               // NEED TO PUT YOUR INFO HERE
  password: '<pass>',                               // NEED TO PUT YOUR INFO HERE
  apiVersion: '2',
  strictSSL: false
});



// CONNECT TO MONGODB
// ------------------------------------------------
const url = '<server>';                  // SERVER
const dbName = 'jira_blue';                               // DATABASE
MongoClient.connect(url, function (err, client) {
  assert.equal(null, err);                                 //assert :: If an expression evaluates to 0 or false, an error is thrown and the program is terminated:
  console.log("CONNCTED SUCCESSFULLY TO SERVER: " + url);
  const db = client.db(dbName);

  findDocuments(db, function () {                          // RETRIEVE DATA
    client.close();
  });
});



//MONGO QUERY THAT FINDS DOCUMENTS AND MAPS
// ------------------------------------------------
const findDocuments = function (db, callback) {            // COLLECTION
  const collection = db.collection('LMBCSS_new');
  collection.find({}).toArray(function (err, docs) {
    assert.equal(err, null);
    docs.forEach((e, index) => {                            // ASSIGN DATA FROM QUERY TO lmObject
      let storyPoints = e.fields.story_points;
      let LMKey = e.key;
      let lmIssue = new lmObject(LMKey, storyPoints);
      LMIssuesArray.push(lmIssue);
    });
    finalMapping();                                          // CALL TO DO FINAL MAP OF LM DATA (lmObject) TO LFG DATA (mapObject)
    callback(docs);
  });
}

function finalMapping() {
  jira.getIssuesForBoard('24', 0, 10000000)                   //rapidviewIDboardID = boardID :: (board, startAt, maxPullRequest)
    .then((x, index) => {
      x.issues.forEach((e, index) => {
        var blueKey = "";
        e.fields.labels.forEach(f => {
          if (f.substring(0, 11) == "Blue_Issue:") {
            blueKey = f.replace("Blue_Issue:", "");
          }
        });
        var points;
        if (blueKey != "") {
          LMIssuesArray.find((g, index) => {
            let story = g.StoryPoints;
            if (g.LMKey == blueKey) {
              if (story == null) {
                points = null;
              } else {
                points = story;
              }
            }
          })
        } else {
          points = null;
        }

        let issue = new mapObject(e.id, e.key, e.fields.customfield_10106, blueKey, points);
        LFGIssuesArray.push(issue);
      });                                                             // ANYTHING PAST HERE FIRES ONE TIME
      
      createCSV();
      migrateStoriesToLFG();
      //console.log(LFGIssuesArray);
    })
    .catch(err => {
      console.log(err);
    })
}



//ASSIGN FIELDS FROM LM-JIRA DATA TO LFG-JIRA
// ------------------------------------------------
function migrateStoriesToLFG() {
  LFGIssuesArray.forEach(e => {                                        // UPDATING ONE ISSUE AT A TIME
    try {
      if (e.LFGStoryPoints != null && e.LFGStoryPoints > 0) {          // DO NOT ASSIGN IF LFG ALREADY HAS STORY POINTS ON ISSUE
        console.log("STORY POINT ALREADY IN PLACE FOR: " + e.LFGKey);
      } else {                                                         // BEGIN ASSIGNMENT FOR ISSUES IN LFG WITHOUT STORY POINTS
        let body = {
          "fields": {
            "customfield_10106": e.LMStoryPoints
          }
        }

        jira.updateIssue(e.LFGID, body)
          .then(issue => {
            console.log("FIELD MIGRATION COMPLETE FOR: " + e.LFGKey);
          })
          .catch(err => {
            console.error(err);
          });
      }

    } catch (err) {
      console.log("UPDATE NOT OCCURING ON: " + e.LFGKey);
      //console.log("ERROR: " + err);                               // ERR IS HUGE - DO NOT FIRE UNLESS NEEDED
    }
  });
}



// CREATES THE CSV
// -------------------------------------------------
function createCSV() {
  const csvWriter = createCsvWriter({
    path: 'C:/Users/tyibe3/Desktop/Jira_Migration_Map.csv',         // ASSIGN PATH AND FILE NAME
    header: [                                                       // ASSIGN CSV HEADERS :: id <-- PROPERTY ON ARRAY/OBJECT :: title <-- PRINT ON CSV
      { id: 'LFGKey', title: 'LFGKey' },
      { id: 'LMKey', title: 'LMKey' },
      { id: 'LFGStoryPoints', title: 'LFGStoryPoints' },
      { id: 'LMStoryPoints', title: 'LMStoryPoints' },
      { id: 'LFGID', title: 'LFGID' }
    ]
  });

  const records = LFGIssuesArray;
  csvWriter.writeRecords(records)                                    // RETURNS A PROMISE - COMPLETE WHEN ALL WRITING DONE
    .then(() => {
      console.log('CSV CREATION COMPLETE');
    });
}



// ADDITIONAL JIRA-CLIENT TEST QUERIES
//-----------------------------------------------------

// FIND SINGLE ISSUE
// jira.findIssue('GPCSS-1096')
//   .then(issue => {
//     updateTempIssue(issue.id);
//   })
//   .catch(err => {
//     console.error(err);
//   });

// UPDATE A SINGLE ISSUE
// function updateTempIssue(id) {
//   let body = {
//     "fields": {
//       "customfield_10106": 11
//     }
//   }

//   jira.updateIssue(id, body)
//     .then(issue => {
//       console.log("Updated");
//     })
//     .catch(err => {
//       console.error(err);
//     });
// }

// GET LIST OF ISSUES ON A SPRINT
// jira.getBoardIssuesForSprint('24', '17')  //boardID, sprintID
//   .then(x => {
//     console.log(x);
//   })
//   .catch(err => {
//     console.log(err);
//   })

// GET BOARD (JUST THE BOARD)
// jira.getBoard('24')  //boardID
//   .then(x => {
//     console.log(x);
//   })
//   .catch(err => {
//     console.log(err);
//   })