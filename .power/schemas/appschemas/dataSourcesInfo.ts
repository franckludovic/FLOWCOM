/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "buffercall": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {
      "Run": {
        "path": "/{connectionId}/triggers/manual/run",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "input",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "api-version",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "object"
          }
        }
      }
    }
  },
  "fc_audiencesegments": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_audiencesegmentid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "fc_calendaritems": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_calendaritemid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "fc_companies": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_companyid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "fc_companyintegrations": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_companyintegrationid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "fc_companymemberships": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_companymembershipid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "fc_contentscores": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_contentscoreid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "fc_flowcomprofiles": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_flowcomprofileid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "fc_keymessages": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_keymessageid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "fc_libraryitems": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_libraryitemid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "fc_products": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_productid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "fc_roadmapmilestones": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_roadmapmilestoneid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "fc_weeklyreports": {
    "tableId": "",
    "version": "",
    "primaryKey": "fc_weeklyreportid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "modelcall": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {
      "Run": {
        "path": "/{connectionId}/triggers/manual/run",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "input",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "api-version",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "object"
          }
        }
      }
    }
  },
  "savecompanysecret": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {
      "Run": {
        "path": "/{connectionId}/triggers/manual/run",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "input",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "api-version",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "202": {
            "type": "void"
          }
        }
      }
    }
  }
};
