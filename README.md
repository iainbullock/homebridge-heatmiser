# homebridge-heatmiser
## Heatmiser Thermostats Homebridge plugin

This is an Accessory plugin for Nick Farina's Homebridge implementation (https://github.com/nfarina/homebridge)

Based on homebridge-heatmiser by pumamood (https://github.com/pumamood/homebridge-heatmiser), which is in turn based on the version by Thosirl (https://github.com/thosirl/homebridge-heatmiser). 

Reads and Writes with the Heatmiser are done asyncronously by polling, which is makes the plugin faster and less prone to lock ups caused by the slow Heatmiser response.

Tested with Heatmiser Wifi accessory here, not with Netmonitor.


# Installing Plugin

Plugin is NodeJS module published through NPM

You can install this plugin the same way you installed Homebridge - as a global NPM module. For example:

    sudo npm install -g homebridge-heatmiser-iainbullock


Add to config.json under "accessories" array
* For Heatmiser WiFi thermostats

Options for "your_model" are: "DT", "DT-E", "PRT", "PRT-E", "PRTHW" (see https://github.com/carlossg/heatmiser-node/blob/master/lib/wifi.js#L40)

The mintemp & maxtemp options set the range on the thermostat faceplate. The target temperature step size is now 1 degree as required by Heatmiser.

The refreshInterval option controls how often the Heatmiser is polled to read / write its parameters (in milliseconds).

```json
    {
      "accessory": "HeatmiserWifi",
      "ip_address": "your_heatmiserwifi_ip",
      "pin": your_pin,
      "port": 8068,
      "model": "your_model",
      "mintemp": 5,
      "maxtemp": 24,
      "name": "Thermostat",
      "room": "Hall",
      "refreshInterval": 60000
    }

```

