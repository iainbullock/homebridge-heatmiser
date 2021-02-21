'use strict';
var heatmiser = require("heatmiser");
var AsyncLock = require('async-lock');
const key = 'lock';
var Characteristic, Service;

module.exports = function (homebridge) {
    console.log("homebridge API version: " + homebridge.version);
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-heatmiser', 'HeatmiserWifi', HeatmiserWifi, false);
};

function HeatmiserWifi(log, config, api) {
    this.log = log;
    this.ip_address = config["ip_address"];
    this.pin = config["pin"];
    this.port = config["port"];
    this.model = config["model"];
    this.mintemp = config["mintemp"];
    this.maxtemp = config["maxtemp"];
    this.refreshInterval = config["refreshInterval"];
    this.writeTHCSNeeded = 0;
    this.writeTTNeeded = 0;

    this.lock = new AsyncLock({ timeout: config["timeout"] || 5000 });

    this.thermostat = new Service.Thermostat();
    this.thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on('get', this.getCurrentHeatingCoolingState.bind(this));
    this.thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('set', this.setTargetHeatingCoolingState.bind(this))
      .on('get', this.getTargetHeatingCoolingState.bind(this));
    this.thermostat.getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));
    this.thermostat.getCharacteristic(Characteristic.TargetTemperature)
      .on('set', this.setTargetTemperature.bind(this))
      .on('get', this.getTargetTemperature.bind(this))
      .setProps({minValue: this.mintemp, maxValue: this.maxtemp, minStep: 1});
    this.thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('set', this.setTemperatureDisplayUnits.bind(this))
      .on('get', this.getTemperatureDisplayUnits.bind(this));

    // polling
    this.timer = setTimeout(this.poll.bind(this), this.refreshInterval);

  }

HeatmiserWifi.prototype = {

    setTargetHeatingCoolingState: function (setTargetHeatingCoolingState, callback) {
      this.writeTHCSNeeded = 1;
      var THCS = this.thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).value; // 0,1,2,3
      this.log('setTargetHeatingCoolingState: ' + THCS);
    callback(null);
    },

    getCurrentHeatingCoolingState: function (callback) {
      var CHCS = this.thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value; // 0,1,2
//      this.log('getCurrentHeatingCoolingState: ' + CHCS);
    callback(null,CHCS);
    },

    getTargetHeatingCoolingState: function (callback) {
        var THCS = this.thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).value; // 0,1,2,3
//        this.log('getTargetHeatingCoolingState: ' + THCS);
    callback(null,THCS);
    },

    getCurrentTemperature: function (callback) {
        var CT = this.thermostat.getCharacteristic(Characteristic.CurrentTemperature).value; // 0-100
//        this.log('getCurrentTemperature: ' + CT);
    callback(null,CT)
    },

    getTargetTemperature: function (callback) {
        var TT = this.thermostat.getCharacteristic(Characteristic.TargetTemperature).value; // 10-38
//        this.log('getTargetTemperature: ' + TT);
    callback(null,TT);
    },

    setTargetTemperature: function (targetTemperature, callback) {
        this.writeTTNeeded = 1;
        var TT = this.thermostat.getCharacteristic(Characteristic.TargetTemperature).value; // 10-38
        this.log('setTargetTemperature: ' + TT);
      callback(null);
    },

    getTemperatureDisplayUnits: function (callback) {
        var TDU = this.thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits).value; // 0,1
//        this.log('getTemperatureDisplayUnits: ' + TDU);
    callback(null,TDU)
    },

    setTemperatureDisplayUnits: function (displayUnits, callback) {
        this.log("setTemperatureDisplayUnits: " + displayUnits);
    callback(null);
    },

    getName: function (callback) {
        this.log("getName");
        callback(null, this.name);
    },

    identify: function (callback) {
        this.log("Identify requested!");
        callback(); // success
    },

    getServices: function () {
        if (!this.thermostat) return [];
        // you can OPTIONALLY create an information service if you wish to override
        // the default values for things like serial number, model, etc.
        var informationService = new Service.AccessoryInformation();

        informationService
          .setCharacteristic(Characteristic.Manufacturer, "Heatmiser")
          .setCharacteristic(Characteristic.Model, "Heatmiser Wifi") // Possible to get actual Model from DCB if required
          .setCharacteristic(Characteristic.SerialNumber, "HMHB-1");

        return [informationService, this.thermostat];

    },

    poll: function() {
        if(this.timer) clearTimeout(this.timer);
        this.timer = null;

        var CHCS = this.thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value; // 0,1,2
        var THCS = this.thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).value; // 0,1,2,3
        var CT = this.thermostat.getCharacteristic(Characteristic.CurrentTemperature).value; // 0-100
        var TT = this.thermostat.getCharacteristic(Characteristic.TargetTemperature).value; // 10-38
        var TDU = this.thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits).value; // 0,1
        var awayMode, targetTemperature;

        if (this.writeTTNeeded || this.writeTHCSNeeded) {
          // Write to Heatmiser
          if (this.writeTHCSNeeded) {
            this.log('Polling. Writing THCS. Current values are: CHCS: ' + CHCS + ' THCS: ' + THCS + ' CT: ' + CT + ' TT: ' + TT + ' TDU: ' + TDU);
            switch (THCS){
              case Characteristic.TargetHeatingCoolingState.OFF:
                targetTemperature = this.mintemp;
                awayMode = 'away';
                break;
              case Characteristic.TargetHeatingCoolingState.COOL:
                targetTemperature = this.mintemp;
                awayMode = 'home';
                break;
              case Characteristic.TargetHeatingCoolingState.AUTO:
                targetTemperature = Math.round(CT);
                awayMode = 'home';
                break;
              case Characteristic.TargetHeatingCoolingState.HEAT:
                targetTemperature = Math.trunc(CT) + 1;
                awayMode = 'home';
                break;
              default:
                targetTemperature = CT;
                awayMode = 'home';
                break;
                }

              this.writeTHCSNeeded = 0;

              } else {
              this.log('Polling. Writing TT. Current values are: CHCS: ' + CHCS + ' THCS: ' + THCS + ' CT: ' + CT + ' TT: ' + TT + ' TDU: ' + TDU);
              targetTemperature = TT;
              this.writeTTNeeded = 0;
              }

          var dcb1 = {
                heating: {
                    target: targetTemperature
                }
            }

          var dcb2 = {
              away_mode: awayMode
            }

            var hm = new heatmiser.Wifi(this.ip_address, this.pin, this.port, this.model), error = null;
            hm.on('error', (err) => {this.log('Polling: An error occurred on writing! ' + err.message); error = err;});

            hm.write_device(dcb1);
            //hm.write_device(dcb2);

            this.log('Polling. Written target_temp: ' + targetTemperature);

        } else {
          // Read from Heatmiser
          this.log('Polling. Reading. Current values are: CHCS: ' + CHCS + ' THCS: ' + THCS + ' CT: ' + CT + ' TT: ' + TT + ' TDU: ' + TDU);

          var hm = new heatmiser.Wifi(this.ip_address, this.pin, this.port, this.model), error = null;
          hm.on('error', (err) => {this.log('Polling: An error occurred on reading! ' + err.message); error = err;});

          hm.read_device(function (data) {
              var heatingOn = data.dcb.heating_on;
              var awayMode = data.dcb.away_mode;
              var current_temp = data.dcb.built_in_air_temp;
              var target_temp = data.dcb.set_room_temp;
              var units = data.dcb.temp_format;
              var mode;
              this.log('Polling. Read values: heatingOn: ' + heatingOn + ' awayMode: ' + awayMode + ' current_temp: ' + current_temp + ' target_temp: ' + target_temp + ' units: ' + units);

              if (heatingOn == true) {mode = Characteristic.CurrentHeatingCoolingState.HEAT;}
                else if (awayMode == true) {mode = Characteristic.CurrentHeatingCoolingState.OFF;}
                  else {mode = Characteristic.CurrentHeatingCoolingState.COOL;}
              this.thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(mode);

              if (awayMode == true) {mode = Characteristic.TargetHeatingCoolingState.OFF;}
                  else {mode = Characteristic.TargetHeatingCoolingState.AUTO;}
              this.thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(mode);

              this.thermostat.getCharacteristic(Characteristic.CurrentTemperature).updateValue(current_temp);
              this.thermostat.getCharacteristic(Characteristic.TargetTemperature).updateValue(target_temp);
              this.thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits).updateValue(units == 'C' ? 0 : 1);
              }.bind(this));
          }

        this.timer = setTimeout(this.poll.bind(this), this.refreshInterval)

        }
}
