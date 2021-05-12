/**
 * model-get
 * Handle any operations where an Object is trying to retrive a value[s] it is
 * responsible for.
 */

const ABBootstrap = require("../AppBuilder/ABBootstrap");
const cleanReturnData = require("../AppBuilder/utils/cleanReturnData");
const Errors = require("../utils/Errors");

/**
 * tryFind()
 * we wrap our actual find actions in this tryFind() routine.  Mostly so that
 * if we encounter an Error that would just be a simple: retry, we can do that
 * easily. (looking at you ECONNRESET errors).
 * @param {ABObject} object
 *       the ABObject that we are using to perform the findAll()s
 * @param {obj} cond
 *       the condition object for the findAll() where conditions.
 * @param {obj} condDefaults
 *       our findAll() requires some default info about the USER
 * @param {ABUtil.request} req
 *       the request instance that handles requests for the current tenant
 * @param {int} retry
 *       a count of how many retry attempts.
 * @param {Error} lastError
 *       the last Error reported in trying to make the findAll().
 *       this is what is passed on if we have too many retries.
 * @return {Promise}
 *       .resolve() with the [{data}] entries from the findAll();
 */
function tryFind(object, cond, condDefaults, req, retry = 0, lastError = null) {
   // prevent too many retries
   if (retry >= 3) {
      req.log("Too Many Retries ... failing.");
      if (lastError) {
         throw lastError;
      } else {
         throw new Error("Too Many failed Retries.");
      }
      return;
   }

   var pFindAll = object.model().findAll(cond, condDefaults, req);

   var pCount = Promise.resolve().then(() => {
      // if no cond.limit was set, then return the length pFindAll
      if (!cond.limit) {
         // return the length of pFindAll
         return pFindAll.then((results) => results.length);
      } else {
         return object.model().findCount(cond, condDefaults, req);
      }
   });

   return Promise.all([pFindAll, pCount]).catch((err) => {
      if (Errors.isRetryError(err.code)) {
         req.log(`LOOKS LIKE WE GOT A ${err.code}! ... trying again:`);
         return tryFind(object, cond, condDefaults, req, retry + 1, err);
      }

      // if we get here, this isn't a RESET, so propogate the error
      throw err;
   });
}

module.exports = {
   /**
    * Key: the cote message key we respond to.
    */
   key: "appbuilder.model-get",

   /**
    * inputValidation
    * define the expected inputs to this service handler:
    * Format:
    * "parameterName" : {
    *    {joi.fn}   : {bool},  // performs: joi.{fn}();
    *    {joi.fn}   : {
    *       {joi.fn1} : true,   // performs: joi.{fn}().{fn1}();
    *       {joi.fn2} : { options } // performs: joi.{fn}().{fn2}({options})
    *    }
    *    // examples:
    *    "required" : {bool},  // default = false
    *
    *    // custom:
    *        "validation" : {fn} a function(value, {allValues hash}) that
    *                       returns { error:{null || {new Error("Error Message")} }, value: {normalize(value)}}
    * }
    */
   inputValidation: {
      objectID: { string: { uuid: true }, required: true },
      cond: { object: true, required: true },
      /* cond is in EXPANDED format:
       * cond.where {obj}
       * cond.sort
       * cond.populate
       * cond.offset
       * cond.limit
       */
   },

   /**
    * fn
    * our Request handler.
    * @param {obj} req
    *        the request object sent by the api_sails/api/controllers/appbuilder/model-get.
    * @param {fn} cb
    *        a node style callback(err, results) to send data when job is finished
    */
   fn: function handler(req, cb) {
      req.log("appbuilder.model-get:");

      // get the AB for the current tenant
      ABBootstrap.init(req)
         .then((AB) => {
            var id = req.param("objectID");
            var object = AB.objectByID(id);
            if (!object) {
               object = AB.queryByID(id);
            }
            if (!object) {
               return Errors.missingObject(id, req, cb);
            }

            var cond = req.param("cond");

            var condDefaults = {
               languageCode: req.languageCode(),
               username: req.username(),
            };

            req.log(JSON.stringify(cond));
            req.log(JSON.stringify(condDefaults));

            // 1) make sure any incoming cond.where values are in our QB
            // format.  Like sails conditions, old filterConditions, etc...
            object.convertToQueryBuilderConditions(cond);

            // 2) make sure any given conditions also include the User's
            // scopes.
            // TODO:
            // object.includeScopes(cond, condDefaults) .then()

            // 3) now Take all the conditions and reduce them to their final
            // useable form: no complex in_query, contains_user, etc...
            object
               .reduceConditions(cond.where, condDefaults)
               .then(() => {
                  req.log(`reduced where: ${JSON.stringify(cond.where)}`);
                  // 4) Perform the Find Operations
                  tryFind(object, cond, condDefaults, req)
                     .then((results) => {
                        // {array} results
                        // results[0] : {array} the results of the .findAll()
                        // results[1] : {int} the results of the .findCount()

                        var result = {};
                        result.data = results[0];

                        // webix pagination format:
                        result.total_count = results[1];
                        result.pos = cond.offset || 0;

                        result.offset = cond.offset || 0;
                        result.limit = cond.limit || 0;

                        if (
                           result.offset + result.data.length <
                           result.total_count
                        ) {
                           result.offset_next = result.offset + result.limit;
                        }

                        // clear any .password / .salt from SiteUser objects
                        cleanReturnData(AB, object, result.data).then(() => {
                           cb(null, result);
                        });
                     })
                     .catch((err) => {
                        req.notify.developer(err, {
                           context:
                              "Service:appbuilder.model-get: IN tryFind().catch() handler:",
                           req,
                           cond,
                           condDefaults,
                        });
                        cb(err);
                     });
               })
               .catch((err) => {
                  req.notify.developer(err, {
                     context:
                        "Service:appbuilder.model-get: ERROR reducing conditions:",
                     req,
                     cond,
                  });
                  cb(err);
               });
         })
         .catch((err) => {
            req.notify.developer(err, {
               context:
                  "Service:appbuilder.model-get: Error initializing ABFactory",
               req,
            });
            cb(err);
         });
   },
};
