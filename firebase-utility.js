const firebaseAdmin = require("./firebaseAdmin");
const utility = require("./utility");

const db = firebaseAdmin.database;
const eocNode = db.ref("eoc");
const representativeInfoNode = eocNode.child("representativeInfo");

async function startEocPreparation() {
  try {
    const currentMonth = utility.getCurrentMonth();
    const eocMonthNode = eocNode.child(`${currentMonth}EOC`);

    const snapshot = await eocMonthNode.get();

    if (snapshot.exists()) {
      return {
        success: false,
        message: `EOC for ${currentMonth.toUpperCase()} already exists.`,
      };
    }

    const initialValues = {
      departments : {
        AMS : {
          defaultAgenda : "Ticket Management",
          progress : {
            isAgendaAndPresentorGathered : false,
          }
        },
        CSM : {
          defaultAgenda : "CSM License",
          progress : {
            isAgendaAndPresentorGathered : false,
          }
        },
        MPS : {
          defaultAgenda : "MPS PLC Monitoring",
          progress : {
            isAgendaAndPresentorGathered : false,
          }
        },
        COMPLIANCE : {
          defaultAgenda : "Compliance Updates",
          progress : {
            isAgendaAndPresentorGathered : false,
          }
        },
        HR : {
          progress : {
            isAgendaAndPresentorGathered : false,
          }
        },
        SFIMPLEM : {
          progress : {
            isAgendaAndPresentorGathered : false,
          }
        },
        GDIMPLEM : {
          progress : {
            isAgendaAndPresentorGathered : false,
          }
        },
        ITIMPLEM : {
          progress : {
            isAgendaAndPresentorGathered : false,
          }
        }
      },
      meetingDate : false,
      startPrep : true,
    }

    await eocMonthNode.set(initialValues);

    return {
      success: true,
      message: `EOC preparation started for ${currentMonth.toUpperCase()}.`,
    };
  } catch (e) {
    return {
      success: false,
      message: "Failed to start EOC preparation.",
      error: e.message,
    };
  }
}

async function setEOCDate(date) {
    try {
        const currentMonth = utility.getCurrentMonth();
        const eocMonthNode = eocNode.child(`${currentMonth}EOC`);

        await eocMonthNode.child('meetingDate').set(date);

        // if it reaches this line, the write succeeded
        return 200;
    } catch (error) {
        console.error('Error setting EOC date:', error);
        return 503; // Service Unavailable
    }
}


async function getEOCNode() {
  const snapshot = await eocNode.get();
  if (snapshot.exists()) {
    return snapshot.val();
  } else {
    return null;
  }
}


async function storeMessages(message, waid) {
  try {
    const messagesNode = eocNode.child("messages");
    const messageRef = messagesNode.child(`${waid}-${utility.getPhilippineDateString()}`);
    await messageRef.push(message);
    return true;
  }
  catch (error) {
    console.error("Error storing message:", error);
    return false;
  }
}

async function getMessages(messageRef){
  const messageNode = eocNode.child("messages").child(messageRef);
  const snapshot = await messageNode.get();
  if(snapshot.exists()){
    return snapshot.val();
  }
  else {
    return null;
  }
}

module.exports = {
  startEocPreparation,
  setEOCDate,
  getEOCNode,
  storeMessages,
  getMessages
};
