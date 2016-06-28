enyo.kind({
    name: "PersonModel",
    kind: "enyo.Model",
    source: "db8",
    dbKind: "com.palm.person:1",
    primaryKey: "_id",
    mixins: [enyo.ComputedSupport],
    computed: {
        listPhoto: ["photos", {cached: true}],
        displayPhoto: ["photos", {cached: true}],
        displayName: ["name", "nickname", "organization", "emails", "ims", "phoneNumbers", {cached: true}],
        displayOrg: ["organization"],
        primaryPhoneNumber: ["phoneNumbers"]
    },
    defaults: {
        name: {},
        birthday: "",
        nickname: "",
        addresses: [],
        organization: {department: "", name: "", title: ""},
        emails: [],
        ims: [],
        phoneNumbers: [],
        relations: [],
        notes: [],
        urls: []
    },
    // Only these listed properties are saved to DB8.
    // It may not matter whether undocumented fields are included here, so long as records are merged.
    includeKeys: ["_id", "_rev", "_kind", "_sync", "_del", "_ignoreId", 
                  "launcherId", "favorite", "contactIds", "sortKey", "name", "names", "nickname",
                  "organization", "searchTerms", "emails", "phoneNumbers", "ims", "photos",
                  "addresses", "urls", "notes", "birthday", "anniversary", 
                  "gender", "relations", "reminder", "ringtone"],

    parse: function(data) {
    	// termSet is an object used like a set, to weed out duplicate search terms.
    	var termSet = {}, i, name, lowercaseGivenName, lowercaseName, match, field, value, term;

    	function addArrayToSet(array, set) {
    		var j;
			for (j=0; j<array.length; ++j) {
				set[array[j]] = true;
			}    		
    	}

		if ("returnValue" in data) {return undefined;}   // appears to be a raw DB8 response, rather than a record
		
    	try {   // limits the damage of DB8 records that don't follow the schema    		
    		// This usually contains familyName + givenName and firstInitial + familyName, for each contact
    		if (data.searchTerms instanceof Array) {
    			addArrayToSet(data.searchTerms, termSet);
    		}

	    	// everything in the "name" field is also in the "names" array
	    	
	    	if (data.names instanceof Array) {
	    		for (i = 0; i < data.names.length; ++i) {
	    			// indexes all space- & hyphen-separated words
	    			name = data.names[i];
	    			lowercaseGivenName = "";
		    		if (name.givenName) {
		    			lowercaseGivenName = name.givenName.trim().toLowerCase();
		    			termSet[lowercaseGivenName] = true;
		    			addArrayToSet(lowercaseGivenName.split(/[\s-]+/).slice(1), termSet);
		    		}
		    		if (name.middleName) {
		    			lowercaseName = name.middleName.trim().toLowerCase();
		    			termSet[lowercaseName] = true;
		    			addArrayToSet(lowercaseName.split(/[\s-]+/).slice(1), termSet);
		    		}
		    		if (name.familyName) {
		    			lowercaseName = name.familyName.trim().toLowerCase();
		    			termSet[lowercaseName + lowercaseGivenName] = true;
		    			addArrayToSet(lowercaseName.split(/[\s-]+/).slice(1), termSet);
		    		}
		    		// TODO: exclude words such as "de", "la" and "der" individually, but allow with their subjects ("dewitte")	    			
	    		}
	    	}
	    	
	    	if (data.nickname) {
	    		lowercaseName = data.nickname.trim().toLowerCase();
	    		termSet[lowercaseName] = true;
	    		addArrayToSet(lowercaseName.split(/\s+/).slice(1), termSet);
	    	}
	    	
	    	if (data.organization && data.organization.name) {
	    		lowercaseName = data.organization.name.trim().toLowerCase();
	    		termSet[lowercaseName] = true;	    		
	    		addArrayToSet(lowercaseName.split(/[\s\/]+/).slice(1), termSet);
	    	}
	    	
	    	if (data.emails instanceof Array) {
	    		for (i=0; i<data.emails.length; ++i) {
	    			field = data.emails[i];
	    			if (field.normalizedValue) {
	    				value = field.normalizedValue.trim();
	    			} else if (field.value) {
	    				value = field.value.trim().toLowerCase();
	    			} else {
	    				value = "";
	    			}
	    			if (value) {
		    			match = /^\s*([^@]+)/.exec(value);   // chars before the @-sign
		    			if (match) {
		    				lowercaseName = match[1].trim();
		    	    		termSet[lowercaseName] = true;
		    	    		addArrayToSet(lowercaseName.split(/[\s._-]+/).slice(1), termSet);
		    			}
	    			}
	    		}
	    	}
	    	
	    	if (data.ims instanceof Array) {
	    		for (i=0; i<data.ims.length; ++i) {
	    			field = data.ims[i];
//	    			console.log(data.name && data.name.familyName, "IM", field, field.normalizedValue, field.value);
	    			if (field.normalizedValue) {
	    				lowercaseName = field.normalizedValue.trim();
	    			} else if (field.value) {
	    				lowercaseName = field.value.trim().toLowerCase();
	    			} else {
	    				lowercaseName = "";
	    			}
	    			if (lowercaseName) {
	    	    		termSet[lowercaseName] = true;
	    	    		addArrayToSet(lowercaseName.split(/[\s._-]+/).slice(1), termSet);	    				
	    			}
	    		}
	    	}
    	} catch (err) {
    		console.error("PersonModel parse:", err);
    	}
    	// console.log("personModelDataParse", data, termSet)
    	data.allSearchTerms = [];
    	for (term in termSet) {
    		// Ideally, we would test that the term contains at least two consecutive Unicode letters, but JS doesn't readily support that,
    		// so we'll test that it contains at least two consecutive char that're *not* ASCII control, punctuation nor digit.
    		// Alternately, it can contain one CJKV character (from the BMP).
    		if (/[^\x00-\x40\x5b-\x60\x7b-\x7f]{2}|[\u4e00-\u62ff\u6300-\u77ff\u7800-\u8cff\u8d00-\u9fcc\u3400-\u4db5]/.test(term)) {
    			data.allSearchTerms.push(term);
    		}
    	}
		if (data.allSearchTerms.length === 0) {
			data.allSearchTerms.push("");   // This ensures this contact appears in the list of everyone.
		}
//		console.log("PersonModel.parse end:  ", data.name && data.name.givenName, data.name && data.name.familyName, data.allSearchTerms, data);
    	return data;    	
    },

    listPhoto: function () {
        if (! this.get("photos")) return "";
        return this.get("photos").squarePhotoPath || this.get("photos").bigPhotoPath  || "";
    },

    displayPhoto: function () {
        if (! this.get("photos")) return "";
        return this.get("photos").bigPhotoPath || this.get("photos").squarePhotoPath || "";
    },

    /*
     * Tries to build a display name. Fields are used in the following order:
     * 1. name = prefix + given + middle + familiy + suffix
     * 2. nickname
     * 3. organization
     * 4. emails
     * 5. ims
     * 6. phonenumbers
     * If nothing works a generic string is returned.
     */
    displayName: function () {
        var displayName = "",
            name = this.get("name") || {},
            org = this.get("organization") || {},
            emails = this.get("emails") || {},
            ims = this.get("ims") || {},
            phoneNumbers = this.get("phoneNumbers") || {},
            i;

        //TODO: get display properties from options..
        if (name.honorificPrefix) {
            displayName += name.honorificPrefix + " ";
        }
        if (name.givenName) {
            displayName += name.givenName + " ";
        }
        if (name.middleName) {
            displayName += name.middleName + " ";
        }
        if (name.familyName) {
            displayName += name.familyName;
        }
        if (name.honorificSuffix) {
            if (name.honorificSuffix.charAt(1) === " ") { //handle ", PhD" case.
                displayName += name.honorificSuffix;
            } else {
                displayName += ", " + name.honorificSuffix;
            }
        }
        displayName = displayName.trim();

        if (!displayName) {
            displayName = this.get("nickname");
        }

        if (!displayName) {
            displayName = org.title;
            if (displayName && org.name) {
                displayName += ", ";
            }
            displayName += org.name;
        }

        if (!displayName) {
            for (i = 0; i < emails.length; i += 1) {
                displayName = emails[i].value;
                if (displayName) {
                    break;
                }
            }
        }

        if (!displayName) {
            for (i = 0; i < ims.length; i += 1) {
                displayName = ims[i].value;
                if (displayName) {
                    break;
                }
            }
        }

        if (!displayName) {
            for (i = 0; i < phoneNumbers.length; i += 1) {
                displayName = phoneNumbers[i].value;
                if (displayName) {
                    break;
                }
            }
        }

        if (!displayName) {
            displayName = "[No Name Available]";
        }

        return displayName.trim();
    },

    displayOrg: function () {
        var result = "",
            org = this.get("organization") || {};

        if (org.title) {
        	result += org.title;
        }
        if (org.department) {
            if (result) {
                result += ", ";
            }
            result += org.department;
        }
        if (org.name) {
            if (result) {
                result += ", ";
            }
            result += org.name;
        }

        return result;
    },

    primaryPhoneNumber: function(){
        var allPhoneNums = this.get("phoneNumbers");
        if (!allPhoneNums){
            return true;
        }
        var preferredNum = allPhoneNums.length?allPhoneNums[0]:{};
        for (var a=0; a<allPhoneNums.length; a++){
            preferredNum = allPhoneNums[a].primary?allPhoneNums[a]:preferredNum;
        }

        return preferredNum;
    }

});
