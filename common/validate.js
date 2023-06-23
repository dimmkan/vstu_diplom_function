const Ajv = require("ajv");
const MRF = require('./filials_map').mrf;

const ajv = new Ajv();

const dn_schema = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: 'number' },
    task: { type: 'string' },
    user_id: { type: 'number' },
    region_id: { type: 'number' },
    parameters: {
      type: 'object',
      properties: {
        [`${MRF}.customer_dn`]: { type: 'string' }
      },
      required: [`${MRF}.customer_dn`]
    },
  },
  required: ['id', 'task', 'user_id', 'region_id', 'parameters']
};

const dn_action_schema = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: 'number' },
    task: { type: 'string' },
    user_id: { type: 'number' },
    region_id: { type: 'number' },
    parameters: {
      type: 'object',
      properties: {
        [`${MRF}.customer_dn`]: { type: 'string' }
      },
      required: [`${MRF}.customer_dn`]
    },
    action: {
      type: ['object', 'null'],
      properties: {
        action_id: { type: 'number' },
        action_name: { type: 'string' },
        action_parameters: { type: 'object' },
      },
    },
  },
  required: ['id', 'task', 'user_id', 'region_id', 'parameters']
};

const dn_setprofile_schema = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: 'number' },
    task: { type: 'string' },
    user_id: { type: 'number' },
    region_id: { type: 'number' },
    parameters: {
      type: 'object',
      properties: {
        [`${MRF}.customer_dn`]: { type: 'string' }
      },
      required: [`${MRF}.customer_dn`]
    },
    action: {
      type: ['object', 'null'],
      properties: {
        action_id: { type: 'number' },
        action_name: { type: 'string' },
        action_parameters: {
          type: 'object',
          properties: {
            up_spd_id: { type: 'number' },
            up_spd_name: { type: 'string' },
            down_spd_id: { type: 'number' },
            down_spd_name: { type: 'string' },
            spec_id: { type: 'number' },
            spec_name: { type: 'string' },
          },
        },
      }
    },
  },
  required: ['id', 'task', 'user_id', 'region_id', 'parameters']
};

const pstn_schema = {
  type: "object",
  additionalProperties: true,
  properties: {
    id: { type: 'number' },
    task: { type: 'string' },
    user_id: { type: 'number' },
    region_id: { type: 'number' },
    parameters: {
      type: 'object',
      properties: {
        customer_phone_number: { type: 'string' }
      },
      required: ['customer_phone_number']
    },
  },
  required: ['id', 'task', 'user_id', 'region_id', 'parameters']
}


exports.dn_validator = ajv.compile(dn_schema);
exports.pstn_validator = ajv.compile(pstn_schema);
exports.dn_action_validator = ajv.compile(dn_action_schema);
exports.dn_setprofile_validator = ajv.compile(dn_setprofile_schema);
