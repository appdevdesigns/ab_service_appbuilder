/**
 * model-update
 * Handle any operations where an Object is trying to update a value it is
 * responsible for.
 */

const ABBootstrap = require("../utils/ABBootstrap");
const Errors = require("../utils/Errors");

const { ref, raw } = require("objection");

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.model-update",

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
      objectID: { string: true, required: true },
      ID: { string: true, required: true },
      // uuid: {
      //    required: true,
      //    validation: { type: "uuid" }
      // }
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/appbuilder/update.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      req.log("appbuilder.model-get:");

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
            var values = req.param("values");

            updateData(AB, object, id, values, condDefaults, req)
               .then((result) => {
                  /*
 // TODO: Process Triggers:
   var key = `${object.id}.updated`;
   return ABProcess.trigger(key, result)
      .then(() => {
         // updateConnectedFields(object, result);

         // We want to broadcast the change from the server to the client so all datacollections can properly update
         // Build a payload that tells us what was updated
         var payload = {
            objectId: object.id,
            data: result,
         };

         // Broadcast the update
         sails.sockets.broadcast(
            object.id,
            "ab.datacollection.update",
            payload
         );

         resolve(result);
      })
      .catch((err) => {
         return Promise.reject(err);
      });
*/

                  cb(null, result);
               })
               .catch((err) => {
                  req.logError("Error performing update:", err);
                  cb(err);
               });
         })
         .catch((err) => {
            req.logError("ERROR:", err);
            cb(err);
         });
   },
};

/**
 * @functon cleanUp
 * clean up data before response to clients
 *
 * @param {ABObject} - object
 * @param {Object|Array} - data
 */
function cleanUp(object, data) {
   if (data == null) return null;

   if (object.PK() === "uuid") {
      // array
      if (data.forEach) {
         data.forEach((d) => {
            delete d.id;
         });
      }
      // object
      else {
         delete data.id;
      }
   }

   return data;
}

function updateData(AB, object, id, values, userData, req) {
   // get translations values for the external object
   // it will update to translations table after model values updated
   let transParams = AB.cloneDeep(values.translations);

   let validationErrors = object.isValidData(values);
   if (validationErrors.length > 0) {
      return Promise.reject({
         code: "NOT_VALID",
         errors: validationErrors,
      });
   }

   if (object.isExternal || object.isImported) {
      // translations values does not in same table of the external object
      delete values.translations;
   } else {
      // this is an update operation, so ...
      // updateParams.updated_at = (new Date()).toISOString();

      values.updated_at = AB.rules.toSQLDateTime(new Date());

      // Check if there are any properties set otherwise let it be...let it be...let it be...yeah let it be
      if (!values.properties) {
         values.properties = null;
      }
   }

   // Prevent ER_PARSE_ERROR: when no properties of update params
   // update `TABLE_NAME` set  where `id` = 'ID'
   if (values && Object.keys(values).length == 0) values = null;

   if (values == null) {
      values = {};
      values[object.PK()] = ref(object.PK());
   }

   values = cleanUp(object, values);

   // sanity check
   if (!values) {
      values = {};
      values[object.PK()] = id;
   }
   req.log("updateParams:", values);

   // Do Knex update data tasks
   return new Promise((resolve, reject) => {
      object
         .model()
         .update(id, values, userData)
         .then((fullEntry) => {
            resolve(fullEntry);
         })
         .catch((err) => {});
   });
}

/*
function old_updateData(AB, object, id, values, userData, req) {
   // return the parameters from the input params that relate to this object
   // exclude connectObject data field values
   let updateParams = object.requestParams(values);

   // return the parameters of connectObject data field values
   let updateRelationParams = object.requestRelationParams(values);

   // get translations values for the external object
   // it will update to translations table after model values updated
   let transParams = AB.cloneDeep(updateParams.translations);

   let validationErrors = object.isValidData(updateParams);
   if (validationErrors.length > 0) {
      return Promise.reject({
         code: "NOT_VALID",
         errors: validationErrors,
      });
   }

   if (object.isExternal || object.isImported) {
      // translations values does not in same table of the external object
      delete updateParams.translations;
   } else {
      // this is an update operation, so ...
      // updateParams.updated_at = (new Date()).toISOString();

      updateParams.updated_at = AB.rules.toSQLDateTime(new Date());

      // Check if there are any properties set otherwise let it be...let it be...let it be...yeah let it be
      if (values.properties != "") {
         updateParams.properties = values.properties;
      } else {
         updateParams.properties = null;
      }
   }

   // Prevent ER_PARSE_ERROR: when no properties of update params
   // update `TABLE_NAME` set  where `id` = 'ID'
   if (updateParams && Object.keys(updateParams).length == 0)
      updateParams = null;

   if (updateParams == null) {
      updateParams = {};
      updateParams[object.PK()] = ref(object.PK());
   }

   updateParams = cleanUp(object, updateParams);

   // sanity check
   if (!updateParams) {
      updateParams = {};
      updateParams[object.PK()] = id;
   }
   req.log("updateParams:", updateParams);

   // Do Knex update data tasks
   return new Promise((resolve, reject) => {

      let query = object.model().modelKnex().query();
      query
         .patch(updateParams)
         .where(object.PK(), id)
         .then((values) => {
            // track logging
            /*
//// TODO: transaction Logging:
            ABTrack.logUpdate({
               objectId: object.id,
               rowId: id,
               username: userData.username,
               data: Object.assign(
                  updateParams,
                  updateRelationParams,
                  transParams
               ),
            });
            * /

            // create a new query when use same query, then new data are created duplicate
            let updateTasks = updateRelationValues(
               AB,
               object,
               id,
               updateRelationParams
            );

            // update translation of the external table
            if (object.isExternal || object.isImported)
               updateTasks.push(
                  updateTranslationsValues(AB, object, id, transParams)
               );

            // update relation values sequentially
            return (
               // updateTasks
               //    .reduce((promiseChain, currTask) => {
               //       return promiseChain.then(currTask);
               //    }, Promise.resolve([]))
               Promise.all(updateTasks)
                  // Query the new row to response to client
                  .then((values) => {
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
                              offset: 0,
                              limit: 1,
                              populate: true,
                           },
                           userData
                        )
                        .then((newItem) => {
                           let result = newItem[0];
                           resolve(result);

                           /*
 // TODO: Process Triggers:
                           var key = `${object.id}.updated`;
                           return ABProcess.trigger(key, result)
                              .then(() => {
                                 // updateConnectedFields(object, result);

                                 // We want to broadcast the change from the server to the client so all datacollections can properly update
                                 // Build a payload that tells us what was updated
                                 var payload = {
                                    objectId: object.id,
                                    data: result,
                                 };

                                 // Broadcast the update
                                 sails.sockets.broadcast(
                                    object.id,
                                    "ab.datacollection.update",
                                    payload
                                 );

                                 resolve(result);
                              })
                              .catch((err) => {
                                 return Promise.reject(err);
                              });
                            * /
                        });
                  })
                  .catch((err) => {
                     return Promise.reject(err);
                  })
            );
         })
         .catch(reject);
   });
}
*/

/**
 * @function updateRelationValues
 * Make sure an object's relationships are properly updated.
 * We expect that when a create or update happens, that the data in the
 * related fields represent the CURRENT STATE of all it's relations. Any
 * field not in the relation value is no longer part of the related data.
 * @param {ABObject} object
 * @param {integer} id  the .id of the base object we are working with
 * @param {obj} updateRelationParams  "key"=>"value" hash of the related
 *                      fields and current state of values.
 * @return {array}  array of update operations to perform the relations.
 */
/*
function updateRelationValues(AB, object, id, updateRelationParams) {
   var updateTasks = [];

   ////
   //// We are given a current state of values that should be related to our object.
   //// It is not clear if these are new relations or existing ones, so we first
   //// remove any existing relation and then go back and add in the one we have been
   //// told to keep.
   ////

   // NOTE : There is a error when update values and foreign keys at same time
   // - Error: Double call to a write method. You can only call one of the write methods
   // - (insert, update, patch, delete, relate, unrelate, increment, decrement)
   //    and only once per query builder
   if (
      updateRelationParams != null &&
      Object.keys(updateRelationParams).length > 0
   ) {
      let clearRelate = (obj, columnName, rowId) => {
         return new Promise((resolve, reject) => {
            // WORKAROUND : HRIS tables have non null columns
            if (obj.isExternal) return resolve();

            // create a new query to update relation data
            // NOTE: when use same query, it will have a "created duplicate" error
            let query = obj.model().modelKnex().query();

            let clearRelationName = AB.rules.toFieldRelationFormat(columnName);

            query
               .where(obj.PK(), rowId)
               .first()
               .then((record) => {
                  if (record == null) return resolve();

                  let fieldLink = obj.fields(
                     (f) => f.columnName == columnName
                  )[0];
                  if (fieldLink == null) return resolve();

                  let objectLink = fieldLink.object;
                  if (objectLink == null) return resolve();

                  record
                     .$relatedQuery(clearRelationName)
                     .alias(`${columnName}_${clearRelationName}`)
                     .unrelate()
                     .then(() => {
                        resolve();
                     })
                     .catch((err) => reject(err));
               })
               .catch((err) => reject(err));
         });
      };

      let setRelate = (obj, columnName, rowId, value) => {
         return new Promise((resolve, reject) => {
            // create a new query to update relation data
            // NOTE: when use same query, it will have a "created duplicate" error
            let query = obj.model().modelKnex().query();

            let relationName = AB.rules.toFieldRelationFormat(columnName);

            query
               .where(obj.PK(), rowId)
               .first()
               .then((record) => {
                  if (record == null) return resolve();

                  record
                     .$relatedQuery(relationName)
                     .alias(`${columnName}_${relationName}`)
                     .relate(value)
                     .then(() => {
                        resolve();
                     })
                     .catch((err) => reject(err));
               })
               .catch((err) => reject(err));
         });
      };

      // update relative values
      Object.keys(updateRelationParams).forEach((colName) => {
         // SPECIAL CASE: 1-to-1 relation self join,
         // Need to update linked data
         let field = object.fields((f) => f.columnName == colName)[0];
         if (
            field &&
            field.settings.linkObject == object.id &&
            field.settings.linkType == "one" &&
            field.settings.linkViaType == "one" &&
            !object.isExternal
         ) {
            let sourceField = field.settings.isSource ? field : field.fieldLink;
            if (sourceField == null) return resolve();

            let relateRowId = null;
            if (updateRelationParams[colName])
               // convert to int
               relateRowId = parseInt(updateRelationParams[colName]);

            // clear linked data
            updateTasks.push(() => {
               return new Promise((resolve, reject) => {
                  let update = {};
                  update[sourceField.columnName] = null;

                  let query = object.model().modelKnex().query();
                  query
                     .update(update)
                     .clearWhere()
                     .where(object.PK(), id)
                     .orWhere(object.PK(), relateRowId)
                     .orWhere(sourceField.columnName, id)
                     .orWhere(sourceField.columnName, relateRowId)
                     .then(() => {
                        resolve();
                     })
                     .catch((err) => reject(err));
               });
            });

            // set linked data
            if (updateRelationParams[colName]) {
               updateTasks.push(() => {
                  return new Promise((resolve, reject) => {
                     let update = {};
                     update[sourceField.columnName] = relateRowId;

                     let query = object.model().modelKnex().query();
                     query
                        .update(update)
                        .clearWhere()
                        .where(object.PK(), id)
                        .then(() => {
                           resolve();
                        })
                        .catch((err) => reject(err));
                  });
               });

               updateTasks.push(() => {
                  return new Promise((resolve, reject) => {
                     let update = {};
                     update[sourceField.columnName] = id;

                     let query = object.model().modelKnex().query();
                     query
                        .update(update)
                        .clearWhere()
                        .where(object.PK(), relateRowId)
                        .then(() => {
                           resolve();
                        })
                        .catch((err) => reject(err));
                  });
               });
            }
         }

         // Normal relations
         else {
            let needToClear = true;

            // If link column is in the table, then will not need to clear connect data
            if (
               updateRelationParams[colName] &&
               field &&
               field.settings &&
               // 1:M
               ((field.settings.linkType == "one" &&
                  field.settings.linkViaType == "many") ||
                  // 1:1 isSource = true
                  (field.settings.linkType == "one" &&
                     field.settings.linkViaType == "one" &&
                     field.settings.isSource))
            ) {
               needToClear = false;
            }

            // Clear relations
            if (needToClear) {
               updateTasks.push(() => clearRelate(object, colName, id));
            }

            // convert relation data to array
            if (!Array.isArray(updateRelationParams[colName])) {
               updateRelationParams[colName] = [updateRelationParams[colName]];
            }

            // We could not insert many relation values at same time
            // NOTE : Error: batch insert only works with Postgresql
            updateRelationParams[colName].forEach((val) => {
               // insert relation values of relation
               updateTasks.push(() => {
                  return setRelate(object, colName, id, val);
               });
            });
         }
      });
   }

   return updateTasks;
}
*/

/**
 * @function updateTranslationsValues
 * Update translations value of the external table
 *
 * @param {ABObject} object
 * @param {int} id
 * @param {Array} translations - translations data
 * @param {boolean} isInsert
 *
 */
/*
function updateTranslationsValues(AB, object, id, translations, isInsert) {
   if (!object.isExternal || !object.isImported) return Promise.resolve();

   let transModel = object.model().modelKnex().relationMappings()[
      "translations"
   ];
   if (!transModel) return Promise.resolve();

   let tasks = [],
      transTableName = transModel.modelClass.tableName;
   multilingualFields = object.fields((f) => f.settings.supportMultilingual);

   (translations || []).forEach((trans) => {
      tasks.push(
         new Promise((next, err) => {
            let transKnex = AB.Knex.connection()(transTableName);

            // values
            let vals = {};
            vals[object.transColumnName] = id;
            vals["language_code"] = trans["language_code"];

            multilingualFields.forEach((f) => {
               vals[f.columnName] = trans[f.columnName];
            });

            // where clause
            let where = {};
            where[object.transColumnName] = id;
            where["language_code"] = trans["language_code"];

            // insert
            if (isInsert) {
               transKnex
                  .insert(vals)
                  .then(function () {
                     next();
                  })
                  .catch(err);
            }
            // update
            else {
               Promise.resolve()
                  .then(() => {
                     // NOTE: There is a bug to update TEXT column of federated table
                     // https://bugs.mysql.com/bug.php?id=63446
                     // WORKAROUND: first update the cell to NULL and then update it again
                     return new Promise((resolve, reject) => {
                        var longTextFields = multilingualFields.filter(
                           (f) => f.key == "LongText"
                        );
                        if (longTextFields.length < 1) return resolve();

                        var clearVals = {};

                        longTextFields.forEach((f) => {
                           clearVals[f.columnName] = null;
                        });

                        transKnex
                           .update(clearVals)
                           .where(where)
                           .then(resolve)
                           .catch(reject);
                     });
                  })
                  .then(() => {
                     return new Promise((resolve, reject) => {
                        transKnex
                           .update(vals)
                           .where(where)
                           .then(resolve)
                           .catch(reject);
                     });
                  })
                  .then(next)
                  .catch(err);
            }
         })
      );
   });

   return Promise.all(tasks);
}
*/