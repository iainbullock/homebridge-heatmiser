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

  }

HeatmiserWifi.prototype = {

    getCurrentHeatingCoolingState: function (callback) {
        this.lock.acquire(key, function (done) {
            var CHCS = this.thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value; // 0,1,2
            var THCS = this.thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).value; // 0,1,2,3
            var CT = this.thermostat.getCharacteristic(Characteristic.CurrentTemperature).value; // 0-100
            var TT = this.thermostat.getCharacteristic(Characteristic.TargetTemperature).value; // 10-38
            var TDU = this.thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits).value; // 0,1
            this.log('getCurrentHeatingCoolingState - CHCS: ' + CHCS + ' THCS: ' + THCS + ' CT: ' + CT + ' TT: ' + TT + ' TDU: ' + TDU);

            var hm = new heatmiser.Wifi(this.ip_address, this.pin, this.port, this.model), error = null;
            hm.on('error', (err) => {this.log('getCurrentHeatingCoolingState: An error occurred! ' + err.message); error = err;});

            hm.read_device(function (data) {
                var heatingOn = data.dcb.heating_on;
                var awayMode = data.dcb.away_mode;
                var current_temp = data.dcb.built_in_air_temp;
                var target_temp = data.dcb.set_room_temp;
                var units = data.dcb.temp_format;
                var mode;
                this.log('getCurrentHeatingCoolingState - heatingOn: ' + heatingOn + ' awayMode: ' + awayMode + ' current_temp: ' + current_temp + ' target_temp: ' + target_temp + ' units: ' + units);

                if (heatingOn == true) {mode = Characteristic.TargetHeatingCoolingState.HEAT;}
                  else if (awayMode == true) {mode = Characteristic.TargetHeatingCoolingState.OFF;}
                    else {mode = Characteristic.TargetHeatingCoolingState.COOL;}

                this.thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(mode);
                this.thermostat.getCharacteristic(Characteristic.CurrentTemperature).updateValue(current_temp);
                this.thermostat.getCharacteristic(Characteristic.TargetTemperature).updateValue(target_temp);
                this.thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits).updateValue(units == 'C' ? 0 : 1);

                //done(error, mode);
                done(null, mode);
                }.bind(this));

            }.bind(this), callback);
        },


    setTargetHeatingCoolingState: function (targetHeatingCoolingState, callback) {
      var CHCS = this.thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value; // 0,1,2
      var THCS = this.thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).value; // 0,1,2,3
      var CT = this.thermostat.getCharacteristic(Characteristic.CurrentTemperature).value; // 0-100
      var TT = this.thermostat.getCharacteristic(Characteristic.TargetTemperature).value; // 10-38
      var TDU = this.thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits).value; // 0,1
      this.log('setTargetHeatingCoolingState - CHCS: ' + CHCS + ' THCS: ' + THCS + ' CT: ' + CT + ' TT: ' + TT + ' TDU: ' + TDU + ' New THCS: ' + targetHeatingCoolingState);

      // Only do anything if there's a change in state
      if (THCS == targetHeatingCoolingState) {
        this.log('setTargetHeatingCoolingState: is the same so not updating');
        callback(null);
        }
      else {
            this.lock.acquire(key, function (done) {
                var awayMode, targetTemperature;

                switch (targetHeatingCoolingState){
                  case Characteristic.TargetHeatingCoolingState.OFF:
                    targetTemperature = this.mintemp;
                    awayMode = 'away';
                    break;
                  case Characteristic.TargetHeatingCoolingState.COOL:
                    targetTemperature = Math.trunc(CT);
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

                    this.thermostat.getCharacteristic(Characteristic.TargetTemperature).updateValue(targetTemperature);
                    this.log("setTargetHeatingCoolingState " + targetHeatingCoolingState + " " + targetTemperature + " " + awayMode + " " + CT);

                    var dcb1 = {
                      heating: {
                        target: targetTemperature
                      }
                    }
                    var dcb2 = {
                      away_mode: awayMode
                    }

                    var hm = new heatmiser.Wifi(this.ip_address, this.pin, this.port, this.model), error = null;
                    hm.on('error', (err) => {this.log('setTargetHeatingCoolingState: An error occurred! ' + err.message); error = err;});

                    hm.write_device(dcb1);
                    hm.write_device(dcb2);

                //done(error);
                done(null);
              }.bind(this), callback);
            };
        },

    getTargetHeatingCoolingState: function (callback) {
        var THCS = this.thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).value; // 0,1,2,3
        this.log('getTargetHeatingCoolingState: ' + THCS);
    callback(null,THCS);
    },

    getCurrentTemperature: function (callback) {
        var CT = this.thermostat.getCharacteristic(Characteristic.CurrentTemperature).value; // 0-100
        this.log('getCurrentTemperature: ' + CT);
    callback(null,CT)
    },

    getTargetTemperature: function (callback) {
        var TT = this.thermostat.getCharacteristic(Characteristic.TargetTemperature).value; // 10-38
        this.log('getTargetTemperature: ' + TT);
    callback(null,TT);
    },

    setTargetTemperature: function (targetTemperature, callback) {
      var CHCS = this.thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value; // 0,1,2
      var THCS = this.thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState).value; // 0,1,2,3
      var CT = this.thermostat.getCharacteristic(Characteristic.CurrentTemperature).value; // 0-100
      var TT = this.thermostat.getCharacteristic(Characteristic.TargetTemperature).value; // 10-38
      var TDU = this.thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits).value; // 0,1
      this.log('setTargetTemperature - CHCS: ' + CHCS + ' THCS: ' + THCS + ' CT: ' + CT + ' TT: ' + TT + ' TDU: ' + TDU + ' New TT: ' + targetTemperature);

      if (TT == targetTemperature) {
        this.log('setTargetTemperature: is the same so not updating');
        callback(null);
        }
      else {
          this.lock.acquire(key, function (done) {
            var dcb1 = {
                  heating: {
                      target: targetTemperature
                  }
              }

              var hm = new heatmiser.Wifi(this.ip_address, this.pin, this.port, this.model), error = null;
              hm.on('error', (err) => {this.log('setTargetTemperature: An error occurred! ' + err.message); error = err;});

              hm.write_device(dcb1);

              //done(error);
              done(null);
          }.bind(this), callback);
        };
    },

    getTemperatureDisplayUnits: function (callback) {
        var TDU = this.thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits).value; // 0,1
        this.log('getTemperatureDisplayUnits: ' + TDU);
    callback(null,TDU)
    },

    setTemperatureDisplayUnits: function (displayUnits, callback) {
        this.log("setTemperatureDisplayUnits: " + displayUnits);
        //this.log(displayUnits);
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
    }
};
