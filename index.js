const utils = require('./common/utility');
const redis = require('./common/redis_async');
const redisSub = require('./common/redis_sub');
const fetch = require('./common/fetch');
const _ = require('ramda');
const FILIAL_ID = require('./common/filials_map').filials;
const MRF = require('./common/filials_map').mrf;
const { dn_validator,
    dn_action_validator,
    } = require('./common/validate');

const redisChannelSrc = 'adapter-functional';
const redisChannelDst = 'transmitter';

const fttxMeasureTask = 'equipment.measure.fttx';
const xponMeasureTask = 'equipment.measure.xpon';
const xdslMeasureTask = 'equipment.measure.xdsl';

const TASKS_INFO = {
    [fttxMeasureTask]: {
        validator: () => dn_action_validator,
        methodGetter: () => 'measure',
        paramBuilder: measureParamBuilder,
        handler: fttxMeasureHandler,
    },
    [xponMeasureTask]: {
        validator: () => dn_validator,
        methodGetter: () => 'measure',
        paramBuilder: measureParamBuilder,
        handler: xponMeasureHandler
    },
    [xdslMeasureTask]: {
        validator: () => dn_action_validator,
        methodGetter: () => 'measure',
        paramBuilder: measureParamBuilder,
        handler: xdslMeasureHandler,
    },
};

const fttxMeasureDataKeys = {
    negotiation: 'negotiation',
    speed: 'speed',
    duplex: 'duplex',
    length: 'length',
    atuc_CRCErrors: 'atuc_crc_errors',
    atur_CRCErrors: 'atur_crc_errors',
    atuc_DropErrors: 'atuc_drop_errors',
    atur_DropErrors: 'atur_drop_errors',
    atuc_IgnoreErrors: 'atuc_ignore_errors',
    atur_IgnoreErrors: 'atur_ignore_errors',
    atuc_RuntErrors: 'atuc_runt_errors',
    atur_RuntErrors: 'atur_runt_errors',
    atuc_JabberErrors: 'atuc_jabber_errors',
    atur_JabberErrors: 'atur_jabber_errors',
    atuc_GiantErrors: 'atuc_giant_errors',
    atur_GiantErrors: 'atur_giant_errors',
    atuc_JumboErrors: 'atuc_jumbo_errors',
    atur_JumboErrors: 'atur_jumbo_errors',
    atuc_Collision: 'atuc_collision',
    atur_Collision: 'atur_collision',
};

const xponMeasureDataKeys = {
    ponSerial: 'ont_serial_number',
    version: 'ont_version',
    type: 'ont_type',
    software: 'ont_software',
    distance: 'ont_distance',
    rssi: 'ont_rssi',
    rxPwr: 'ont_power_rx',
    txPwr: 'ont_power_tx',
};

const xdslMeasureDataKeys = {
    uptime: 'uptime',
    pwrMgnt: 'power_mode',
    lineConfProfile: 'profile',
    atucUp_ChanTxRate: 'atuc_up_tx_rate',
    atucDown_ChanTxRate: 'atuc_down_tx_rate',
    atucUp_AttainableRate: 'atuc_up_attainable_rate',
    atucDown_AttainableRate: 'atuc_down_attainable_rate',
    atucUp_SnrMgn: 'atuc_up_snr_margin',
    atucDown_SnrMgn: 'atuc_down_snr_margin',
    atucUp_Atn: 'atuc_up_atn',
    atucDown_Atn: 'atuc_down_atn',
    atucUp_ChanInterleaveDelay: 'atuc_up_interleave_delay',
    atucDown_ChanInterleaveDelay: 'atuc_down_interleave_delay',
    atucUp_OutputPwr: 'atuc_up_output_power',
    atucDown_OutputPwr: 'atuc_down_output_power',
    atuc_OperationalMode: 'atuc_operational_mode',
    atuc_AdmOperationalMode: 'atuc_adm_operational_mode',
};

const measureExtParamsKeys = {
    equipment_ip_address: 'ip',
    shelf: 'shelf',
    equipment_slot: 'slot',
    equipment_port: 'port',
    equipment_ont_id: 'ontId',
    ont_pon_sn: 'ontPonSN',
};

const ERROR_NO_ERROR = 0;
const ERROR_ADAPTER_TASK_CHECK = 100;
const ERROR_ADAPTER_EXECUTE = 120;
const ERROR_FAILED_VALIDATE = 400; // Ошибка валидации входящих данных
const ERROR_PROVIDER_RESPONSE_DECODE = 402;
const ERROR_FAILED_MUIK_REQUEST = 512; // Если пришел код 200, но статус не ОК (FAILED, CANCELED, etc...)

// Service layer
const deviceDataParser = (equipment) => equipment.split(' ').reduce((acc, currentValue, index) => {
    index === 0 ? acc.type = currentValue.substring(1, currentValue.length - 1).toUpperCase()
        : index === 1 ? acc.vendor = currentValue.toUpperCase()
            : acc.model = currentValue.toUpperCase();
    return acc;
}, {
    type: '',
    vendor: '',
    model: '',
});

const ipAddrDataParser = (ipAddrString) => ipAddrString.split(/:\-|:\*/g).reduce((acc, currentValue, index) => {
    if (index === 0) acc.ip_address = currentValue;
    if (index === 1) {
        const portAndOntDataArray = currentValue.split(' ');
        const portString = portAndOntDataArray[0];
        const portDataArray = portString.split('/').filter(item => !!item);
        if (portDataArray.length === 1) acc.port = parseInt(portDataArray[0]) || null;
        if (portDataArray.length === 2) {
            acc.slot = parseInt(portDataArray[0]) || null;
            acc.port = parseInt(portDataArray[1]) || null;
        };
        if (portDataArray.length === 3) {
            acc.rack = parseInt(portDataArray[0]) || null;
            acc.slot = parseInt(portDataArray[1]) || null;
            acc.port = parseInt(portDataArray[2]) || null;
        };
        acc.ont_id = portAndOntDataArray.length === 3 ? parseInt(portAndOntDataArray[2]) || null : '';
    }
    return acc;
}, {
    ip_address: '',
    rack: null,
    slot: null,
    port: null,
    ont_id: null,
})

const dataMapper = (dataObject, mappingKeys, omitFieldsArray = []) => Object
    .entries(_.omit(omitFieldsArray, dataObject)).reduce((acc, [key, value]) => {
        if (!mappingKeys[key]) return acc;
        acc[mappingKeys[key]] = value;
        return acc;
    }, {});

const paramDataMapper = (dataObject, mappingKeys, omitFieldsArray = []) => Object
    .entries(_.omit(omitFieldsArray, dataObject)).filter(([_, value]) => !!value).reduce((acc, [key, value]) => {
        if (!mappingKeys[key]) return acc;
        acc[mappingKeys[key]] = value;
        return acc;
    }, {});

// Parameter builders
function measureParamBuilder(data) {
    if (data.parameters[`${MRF}.customer_dn`]) {
        return {
            timeout: 300,
            dn: data.parameters[`${MRF}.customer_dn`],
            reqId: `${data.id}-data`,
            operator: data.user_id,
            filialId: FILIAL_ID[data.region_id]
        }
    } else {
        return {
            timeout: 300,
            reqId: `${data.id}-data`,
            operator: data.user_id,
            filialId: FILIAL_ID[data.region_id],
            ...paramDataMapper(data.parameters, measureExtParamsKeys),
        };
    }


}

// Handlers
function fttxMeasureHandler(data) {
    try {
        const deviceData = deviceDataParser(data.equipment ?? '');
        const ipAddrData = _.pick(['ip_address', 'slot', 'port'], ipAddrDataParser(data.portAddr ?? ''));
        const fttxData = dataMapper(data.fttxData, fttxMeasureDataKeys, ['sRules']);
        const interfaceStatusData = _.pick(['negotiation', 'speed', 'duplex', 'length'], fttxData);
        const interfaceCountersData = _.omit([['negotiation', 'speed', 'duplex', 'length']], fttxData)
        return {
            tech_data: {
                ...deviceData,
                ...ipAddrData,
                dn: data.dn,
            },
            interface_status: {
                status_adm: data.admStatus.toUpperCase() ?? '',
                status_oper: data.operStatus.toUpperCase(),
                ...Object.entries(interfaceStatusData).reduce((acc, [key, value]) => {
                        acc[key] = Number(value) || Number(value) === 0 ? key === 'speed' ? Number((Number(value) / 1000000).toFixed(2)) : Number(value) : value.toUpperCase();
                        return acc;
                    }, {}),
            },
            interface_counters: _.compose(
                _.reduce((acc, item) => {
                    Object.entries(item).forEach(([key, value]) => {
                        if (acc[key]) acc[key].push(value);
                        else acc[key] = [value];
                    });
                    return acc;
                }, {}),
                _.reduce((acc, [key, value]) => {
                    const directionTranslate = {
                        atuc: 'К абоненту',
                        atur: 'От абонента',
                    };
                    acc.push({
                        direction: directionTranslate[key],
                        ...value,
                    });
                    return acc;
                }, []),
                Object.entries,
                _.reduce((acc, [key, value]) => {
                    if (key.includes('atuc_')) {
                        acc.atuc[key.replace('atuc_', '')] = parseInt(value) === NaN ? null : parseInt(value);
                    } else if (key.includes('atur_')) {
                        acc.atur[key.replace('atur_', '')] = parseInt(value) === NaN ? null : parseInt(value);
                    }
                    return acc;
                }, {
                    atuc: {},
                    atur: {},
                }),
                Object.entries,
            )(interfaceCountersData),
            port_mac: {
                mac_address: data.mac,
            },
            port_vlan: data.fttxData.sRules
                .map((item) => Object.entries(item).reduce((acc, [key, value]) => {
                        acc[key] = Number(value) || Number(value) === 0 ? Number(value) : value.toUpperCase();
                        return acc;
                    }, {}))
                .reduce((acc, item) => {
                    acc.vlan_upper.push(item.svlan);
                    acc.vlan_lower.push(item.vlan);
                    return acc;
                }, {
                    vlan_upper: [],
                    vlan_lower: [],
                }),
        };
    } catch (error) {
        throw { message: error.message, code: ERROR_PROVIDER_RESPONSE_DECODE, description: 'Ошибка при разборе ответа системы-провайдера' };
    }
}

function xponMeasureHandler(data) {
    try {
        const deviceData = deviceDataParser(data.equipment ?? '');
        const ipAddrData = _.pick(['ip_address', 'rack', 'slot', 'port', 'ont_id'], ipAddrDataParser(data.portAddr ?? ''));
        const xponData = dataMapper(data.xponData, xponMeasureDataKeys, ['srvRules', 'ontPorts']);
        return {
            tech_data: {
                ...deviceData,
                ...ipAddrData,
                dn: data.dn,
            },
            ont_state: {
                status_adm: data.admStatus.toUpperCase() ?? '',
                status_oper: data.operStatus.toUpperCase(),
                ...Object.entries(xponData).reduce((acc, [key, value]) => {
                        digitFields = ['ont_distance', 'ont_rssi', 'ont_power_rx', 'ont_power_tx'];
                        acc[key] = digitFields.includes(key) ? Number(value.replace(',', '.')) : value.toUpperCase();
                        return acc;
                    }, {}),

            },
            port_mac: {
                mac_address: data.mac,
            },
            port_vlan: data.xponData.srvRules
                .map((item) => dataMapper(item, {
                    id: 'service_port',
                    status: 'service_port_status',
                    vlan: 'vlan',
                }))
                .map((item) => Object
                    .entries(item).reduce((acc, [key, value]) => {
                        acc[key] = key !== 'service_port_status' ? Number(value) : value.toUpperCase();
                        return acc;
                    }, {})).reduce((acc, item) => {
                    Object.entries(item).forEach(([key, value]) => {
                        if (acc[key]) acc[key].push(value);
                        else acc[key] = [value];
                    });
                    return acc;
                }, {}),
            ont_ports: data.xponData.ontPorts
                .map((item) => dataMapper(item, {
                    id: "port_number",
                    type: "port_type",
                    speed: "port_speed",
                    duplex: "port_duplex",
                    status: "port_status",
                }))
                .map((item) => Object
                    .entries(item).reduce((acc, [key, value]) => {
                        acc[key] = key === 'port_speed' || key === 'port_number' ? Number(value) : value.toUpperCase();
                        return acc;
                    }, {})).reduce((acc, item) => {
                    Object.entries(item).forEach(([key, value]) => {
                        if (acc[key]) acc[key].push(value);
                        else acc[key] = [value];
                    });
                    return acc;
                }, {}),
        };
    } catch (error) {
        throw { message: error.message, code: ERROR_PROVIDER_RESPONSE_DECODE, description: 'Ошибка при разборе ответа системы-провайдера' };
    }
}

function xdslMeasureHandler(data) {
    try {
        const deviceData = deviceDataParser(data.equipment ?? '');
        const ipAddrData = _.pick(['ip_address', 'rack', 'slot', 'port'], ipAddrDataParser(data.portAddr ?? ''));
        const xdslData = dataMapper(data.xdslData, xdslMeasureDataKeys, ['pvc', 'modem']);
        const interfaceStatusData = _.pick(['uptime', 'power_mode', 'profile'], xdslData);
        const lineStatusData = _.omit(['uptime', 'power_mode', 'profile'], xdslData);

        const speedFields = ['atuc_up_tx_rate', 'atuc_down_tx_rate', 'atuc_up_attainable_rate', 'atuc_down_attainable_rate'];
        const infoFields = ['atuc_operational_mode', 'atuc_adm_operational_mode'];

        return {
            tech_data: {
                ...deviceData,
                ...ipAddrData,
                dn: data.dn,
            },
            interface_status: {
                status_adm: data.admStatus.toUpperCase() ?? '',
                status_oper: data.operStatus.toUpperCase(),
                ...Object.entries(interfaceStatusData).reduce((acc, [key, value]) => {
                        acc[key] = key === 'uptime' ? Number(value.replace(',', '.')) : value.toUpperCase();
                        return acc;
                    }, {}),
            },
            line_status: {
                ...Object.entries(lineStatusData).reduce((acc, [key, value]) => {
                        value = value.replace(',', '.');
                        acc[key] = !infoFields.includes(key) ? speedFields.includes(key) ? Number((Number(value) / 1000000).toFixed(2)) : Number(value) : value.toUpperCase();
                        return acc;
                    }, {}),
            },
            port_mac: {
                mac_address: data.mac,
            },
            pvc: data.xdslData.pvc.map((item) => Object.entries(item).reduce((acc, [key, value]) => {
                        acc[key] = Number(value) || Number(value) === 0 ? Number(value) : value;
                        return acc;
                    }, {})).reduce((acc, item) => {
                    Object.entries(item).forEach(([key, value]) => {
                        if (acc[key]) acc[key].push(value);
                        else acc[key] = [value];
                    });
                    return acc;
                }, {}),
            modem: Object.entries(dataMapper(data.xdslData.modem, {
                    vendorId: "vendor",
                    versionNumber: "version",
                    serialNumber: "serial_number",
                })).reduce((acc, [key, value]) => {
                    if (acc[key]) acc[key].push(value.toUpperCase());
                    else acc[key] = [value.toUpperCase()];
                    return acc;
                }, {}),
        };
    } catch (error) {
        throw { message: error.message, code: ERROR_PROVIDER_RESPONSE_DECODE, description: 'Ошибка при разборе ответа системы-провайдера' };
    }
}

// Core
const catcher = (error, value) => {
    if (value === redisChannelSrc) {
        utils.log('[Adapter] Another instance of this adapter was trying to get started.');
    } else {
        utils.error('[Adapter]', error.message);
    }
}

const publisher = async (data) => {
    if (data) await redis.publish(redisChannelDst, JSON.stringify(data));
};

const checkResult = (result) => {
    if (result.code !== 200) {
        throw { message: result.message, code: result.code, description: result.description };
    }
    if (result.message.cmdState !== 'OK' || result.message.cmdStatus !== 'DONE') {
        throw {
            description: 'Ошибка запроса в МУИК',
            message: {
                status: result.message.cmdStatus,
                state: result.message.cmdState
            }, code: ERROR_FAILED_MUIK_REQUEST
        };
    }
}

const handleMessage = async (data) => {
    if (!data) return undefined;

    let response = {
        code: ERROR_NO_ERROR,
        message: {
            id: data.id,
            version: '1.0.0',
            data: {},
            action: null
        }
    };

    try {
        const taskInfo = TASKS_INFO[data.task];
        if (!taskInfo) {
            throw { code: ERROR_ADAPTER_TASK_CHECK, message: 'Incorrect task: ' + data.task, description: 'Некорректная задача: ' + data.task };
        }

        const dataValidator = taskInfo.validator();
        const valid = dataValidator(data);
        if (!valid) {
            throw {
                code: ERROR_FAILED_VALIDATE,
                message: dataValidator.errors,
                description: dataValidator.errors.length ? `Ошибка валидации входящих параметров: ${dataValidator.errors[0].message}` : ''
            };
        }

        const params = taskInfo.paramBuilder(data);
        const result = await fetch.sendPost(taskInfo.methodGetter(data), params);
        checkResult(result);
        response.message.data = taskInfo.handler(result.message);
        response.message.action = data.task;
    } catch (error) {
        console.log(error);
        utils.error('[Handler] Error:', error.message);
        response.code = error.code ? error.code : ERROR_ADAPTER_EXECUTE;
        response.message.data = { exception: error.message, description: error.description || '' };
    }
    return response;
};

// Bootstrap
async function start() {
    const subCount = await redis.publish(redisChannelSrc, redisChannelSrc);
    if (subCount > 0) {
        utils.error('[Adapter] Instance of this adapter is already running.');
        redis.quit();
        redisSub.quit();
    } else {
        redisSub.subscribe(redisChannelSrc);
        redisSub.setOnMessage(async (_, message) => _.compose(
            _.andThen(publisher),
            handleMessage,
            _.tryCatch(JSON.parse, catcher)
        )(message));
    }
}

start();