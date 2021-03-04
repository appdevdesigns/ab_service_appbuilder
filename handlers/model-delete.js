/**
 * model-delete
 * our Request handler.
 */

const ABBootstrap = require("../utils/ABBootstrap");
const Errors = require("../utils/Errors");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.model-delete",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    * Format:
    * "parameterName" : {
    *    "required" : {bool},  // default = false
    *    "validation" : {fn|obj},
    *                   {fn} a function(value) that returns true/false if
    *                        the value is valid.
    *                   {obj}: .type: {string} the data type
    *                                 [ "string", "uuid", "email", "number", ... ]
    * }
    */
   inputValidation: {
      objectID: { string: { uuid: true }, required: true },
      ID: { string: { uuid: true }, required: true },
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/appbuilder/model-delete.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      //
      req.log("appbuilder.model-delete:");

      ABBootstrap.init(req)
         .then((AB) => {
            var objID = req.param("objectID");
            var object = AB.objectByID(objID);
            if (!object) {
               return Errors.missingObject(objID, req, cb);
            }

            var condDefaults = {
               languageCode: req.languageCode(),
               username: req.username(),
            };

            var id = req.param("ID");

            var oldItem = null;
            // {valueHash}
            // the current value of the row we are deleting

            var numRows = -1;
            // {int}
            // The # of rows effected by our delete operation.

            // We are deleting an item...but first fetch its current data
            // so we can clean up any relations on the client side after the delete
            findOldItem(AB, req, object, id, condDefaults)
               .then((old) => {
                  oldItem = old;

                  // Now Delete the Item
                  return object.model().delete(id);
               })
               .then((num) => {
                  numRows = num;

                  /*
// Track Logging
                  ABTrack.logDelete({
                     objectId: object.id,
                     rowId: id,
                     username: condDefaults.username,
                     data: oldItem
                  });

// Trigger process
               var key = `${object.id}.deleted`;
               ABProcess.trigger(key, oldItem[0])
                  .then(() => {
                     next();
                  })
                  .catch(next);
*/
               })
               .then(() => {
                  cb(null, { numRows });
               })
               .catch((err) => {
                  req.logError("Error performing delete:", err);
                  cb(err);
               });
         })
         .catch((err) => {
            // Bootstrap Error
            req.logError("ERROR:", err);
            cb(err);
         });

      /*

     var id = req.param("id", -1);
      var object;
      var oldItem;
      var relatedItems = [];
      var numRows = null;

      if (id == -1) {
         var invalidError = ADCore.error.fromKey("E_MISSINGPARAM");
         invalidError.details = "missing .id";
         sails.log.error(invalidError);
         res.AD.error(invalidError, 400);
         return;
      }

      newPendingTransaction();
      async.series(
         [
            // step #1
            function(next) {
               AppBuilder.routes
                  .verifyAndReturnObject(req, res)
                  .then(function(obj) {
                     object = obj;
                     next();
                  })
                  .catch(next);
            },

            // step #2
            function(next) {
               // We are deleting an item...but first fetch its current data
               // so we can clean up any relations on the client side after the delete
               object
                  .queryFind(
                     {
                        where: {
                           glue: "and",
                           rules: [
                              {
                                 key: object.PK(),
                                 rule: "equals",
                                 value: id
                              }
                           ]
                        },
                        populate: true
                     },
                     req.user.data
                  )
                  .then((old_item) => {
                     oldItem = old_item;
                     next();
                  });

               // queryPrevious
               //     .catch(next)
               //     .then((old_item) => {
               //         oldItem = old_item;
               //         next();
               //     });
            },

            // step #3
            function(next) {
               // NOTE: We will update relation data of deleted items on client side
               return next();

               // Check to see if the object has any connected fields that need to be updated
               var connectFields = object.connectFields();

               // If there are no connected fields continue on
               if (connectFields.length == 0) next();

               var relationQueue = [];

               // Parse through the connected fields
               connectFields.forEach((f) => {
                  // Get the field object that the field is linked to
                  var relatedObject = f.datasourceLink;
                  // Get the relation name so we can separate the linked fields updates from the rest
                  var relationName = f.relationName();

                  // If we have any related item data we need to build a query to report the delete...otherwise just move on
                  if (!Array.isArray(oldItem[0][relationName]))
                     oldItem[0][relationName] = [oldItem[0][relationName]];
                  if (
                     oldItem[0] &&
                     oldItem[0][relationName] &&
                     oldItem[0][relationName].length
                  ) {
                     // Push the ids of the related data into an array so we can use them in a query
                     var relatedIds = [];
                     oldItem[0][relationName].forEach((old) => {
                        if (old && old.id) relatedIds.push(old.id); // TODO: support various id
                     });

                     // If no relate ids, then skip
                     if (relatedIds.length < 1) return;

                     // Get all related items info
                     var p = relatedObject
                        .queryFind(
                           {
                              where: {
                                 glue: "and",
                                 rules: [
                                    {
                                       key: relatedObject.PK(),
                                       rule: "in",
                                       value: relatedIds
                                    }
                                 ]
                              },
                              populate: true
                           },
                           req.user.data
                        )
                        .then((items) => {
                           // push new realted items into the larger related items array
                           relatedItems.push({
                              object: relatedObject,
                              items: items
                           });
                        });

                     // var p = queryRelated
                     //     .catch(next)
                     //     .then((items) => {
                     //         // push new realted items into the larger related items array
                     //         relatedItems.push({
                     //             object: relatedObject,
                     //             items: items
                     //         });
                     //     });

                     relationQueue.push(p);
                  }
               });

               Promise.all(relationQueue)
                  .then(function(values) {
                     console.log("relatedItems: ", relatedItems);
                     next();
                  })
                  .catch(next);
            },

            // step #4
            function(next) {
               // Now we can delete because we have the current record saved as oldItem and our related records saved as relatedItems
               object
                  .model()
                  .query()
                  .delete()
                  .where(object.PK(), "=", id)
                  .then((countRows) => {
                     // track logging
                     ABTrack.logDelete({
                        objectId: object.id,
                        rowId: id,
                        username: req.user.data.username,
                        data: oldItem
                     });

                     resolvePendingTransaction();
                     numRows = countRows;
                     next();
                  })
                  .catch(next);
            },

            // step #5: Process the .deleted object lifecycle
            (next) => {
               if (!oldItem) {
                  next();
                  return;
               }

               var key = `${object.id}.deleted`;
               ABProcess.trigger(key, oldItem[0])
                  .then(() => {
                     next();
                  })
                  .catch(next);
            },

            // step #6: now resolve the transaction and return data to the client
            (next) => {
               res.AD.success({ numRows: numRows });

               // We want to broadcast the change from the server to the client so all datacollections can properly update
               // Build a payload that tells us what was updated
               var payload = {
                  objectId: object.id,
                  id: id
               };

               // Broadcast the delete
               sails.sockets.broadcast(
                  object.id,
                  "ab.datacollection.delete",
                  payload
               );

               // Using the data from the oldItem and relateditems we can update all instances of it and tell the client side it is stale and needs to be refreshed
               updateConnectedFields(object, oldItem[0]);
               if (relatedItems.length) {
                  relatedItems.forEach((r) => {
                     updateConnectedFields(r.object, r.items);
                  });
               }
               next();
            }
         ],
         function(err) {
            if (err) {
               resolvePendingTransaction();

               // This object does not allow to update or delete (blocked by MySQL.Trigger)
               if (
                  err.code == "ER_SIGNAL_EXCEPTION" &&
                  err.sqlState == "45000"
               ) {
                  let errResponse = {
                     error: "READONLY",
                     message: err.sqlMessage
                  };

                  res.AD.error(errResponse);
               } else if (!(err instanceof ValidationError)) {
                  ADCore.error.log("Error performing delete!", {
                     error: err
                  });
                  res.AD.error(err);
                  sails.log.error("!!!! error:", err);
               }
            }
         }
      );

*/
   },
};

function findOldItem(AB, req, object, id, condDefaults) {
   return object
      .model()
      .findAll(
         {
            where: {
               glue: "and",
               rules: [
                  {
                     key: object.PK(),
                     rule: "equals",
                     value: id,
                  },
               ],
            },
            populate: true,
         },
         condDefaults
      )
      .then((result) => {
         // we should return the single item, not an array.
         if (result) {
            return result[0];
         }
         return null;
      });
}

function deleteItem(AB, req, object, id, condDefaults) {
   return object.model().delete(id);
}