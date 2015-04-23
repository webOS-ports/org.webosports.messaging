enyo.kind({
    name: "db8Source",
    kind: "enyo.Source",
    dbService: "palm://com.palm.db",
    requests: [],

    _doRequest: function (method, parameters, success, failure, subscribe) {
        var request = new enyo.ServiceRequest({
            service: this.dbService,
            method: method,
            subscribe: !!subscribe,
            resubscribe: !!subscribe
        });
        request.go(parameters);

        request.response(this.generalSuccess.bind(this, success, failure));
        request.error(this.generalFailure.bind(this, failure));
    },
    generalFailure: function (failure, inSender, inError) {
        console.error("db8Source failure:", inSender, " error:", inError);
        var errMsg = this.errorMsgs[inError.errorCode] || $L("Please file a detailed bug report") + " [" + inError.errorCode + "]";
        PalmSystem.addBannerMessage(errMsg, '{ }', "icon.png", "alerts");
        if (failure) {
            failure();
        }
    },
    errorMsgs: {
//        "-985": $L("Please file a detailed bug report") + " (-985)"   // schema validation
    },
    generalSuccess: function (success, failure, inSender, inResponse) {
        console.log("Got success: ", inSender, " did send ", inResponse);
        if (inResponse.returnValue) {
            if (success) {
                if (inResponse.results) {
                    success(inResponse.results); //need to split that up for Models & Collections.
                } else {
                    success(inResponse);
                }
            }
        } else {   // if returnValue is false, would generalSuccess be called?
            if (failure) {
                failure();
            }
        }
    },

    fetch: function(rec, opts) {
        var method,
            subscribe = false,
            parameters;

        if (rec instanceof enyo.Model) {
            parameters = {ids: [rec.get(rec.primaryKey)]};
            method = "get";
            this._doRequest(method, parameters, opts.success, opts.fail, subscribe);
        } else {
        	if (opts.ids) {
                parameters = {ids: opts.ids};
                method = "get";
                this._doRequest(method, parameters, opts.success, opts.fail, subscribe);
        	} else {
        		this._fetchFind(rec, opts);
        	}
        }
    },
    _fetchFind: function (collection, opts) {
        //if more than 500 items need to implement paging
    	// http://www.openwebosproject.org/docs/developer_reference/data_types/db8#Query
    	// It's okay to call opts.success multiple times, but be sure processing the previous
    	// call has finished before calling again (probably using enyo.job()).
    	var query = {
    		select: opts.select,
    		from: collection.dbKind,
    		where: opts.where,
    		orderBy: opts.orderBy,
    		desc: opts.desc,
    		incDel: opts.incDel,
    		limit: opts.limit,
    		page: opts.page
    	};
        var parameters = {query: query, count: false, watch: true};
        console.log("db8Source fetch", collection, opts, parameters);

        var request = new enyo.ServiceRequest({service: this.dbService, method: "find", subscribe: true});
        request.go(parameters);

        request.response(handleFindResponse.bind(this, opts.success, opts.fail));
        request.error(this.generalFailure.bind(this, opts.fail));
        
        this.requests.push(request);

        function handleFindResponse(success, failure, inSender, inResponse) {
        	if (inResponse.results) {
            	console.log("fetch (find) handleFindResponse:", inResponse.results.length, "records", inResponse);

            	// Do we need to store inResponse.next so it can be passed as opts.page?
            	// If we set parameters.count=true, can we make use of inResponse.count?
    			collection.empty();   // replaces all models so sort order is used
            	// Only records can be passed to the success callback.
            	// Never pass anything PalmBus- or DB8-specific.
            	success(inResponse.results);
        	} else if (inResponse.fired) {   // watch
        		console.log("fetch (find) handleFindResponse watch fired:", inResponse);

        		var requestInd = this.requests.findIndex( function (element) { return element === request;} );
				this.requests.splice(requestInd, 1);
				
				this._fetchFind(collection, opts);
        	} else {
        		console.error("fetch (find) handleFindResponse weird response:", inResponse);
        	}
        }
    },
    
    commit: function(rec, opts) {
        var objects;

        if (rec instanceof enyo.Model) {
            objects = [rec.raw()];
        } else {   // enyo.Collection
            objects = rec.raw();
        }

        var request = new enyo.ServiceRequest({ service: this.dbService, method: "merge"});
        request.go({objects: objects});

        request.response(handlePutResponse.bind(this, opts.success, opts.fail));
        request.error(this.generalFailure.bind(this, opts.fail));
        
        function handlePutResponse(success, failure, inSender, inResponse) {
            console.log("commit (merge) handlePutResponse", inResponse);
            var i, j;
        	for (i=0; i<inResponse.results.length; ++i) {
        		for (j=0; j<objects.length; ++j) {
        			if (inResponse.results[i].id === objects[j]._id) {
        				console.log("updating", objects[j], "with", inResponse.results[i]);
        				objects[j]._rev = inResponse.results[i].rev;
        			}
        		}
        	}
        	// Only records can be passed to the success callback.
        	// Never pass anything PalmBus- or DB8-specific.
        	if (rec instanceof enyo.Model) {
        		success(objects[0]);
        	} else {   // enyo.Collection
        		success(objects);
        	}

        }
    },

    destroy: function(rec, opts) {
        var ids;

        if (rec instanceof enyo.Collection) {
            ids = [];
            rec.models.forEach(function (m) {
                ids.push(m.get(m.primaryKey));
            });
        } else {
            ids = [rec.get(rec.primaryKey)];
        }

        this._doRequest("del", {ids: ids}, opts.success, opts.fail);
    },
    find: function(rec, opts) {
        this._doRequest("find", rec, opts.success, opts.fail);
    },
    getIds: function (n, opts) {
        this._doRequest("reserveIds", {count: n || 1}, opts.success, opts.fail);
    }
});
