![Logo](https://i.imgur.com/PyKLAe7.png)

[![License](https://img.shields.io/badge/license-The_Unlicense-red.svg)](https://unlicense.org/)

About
----

**IPsum** is a threat intelligence feed based on 30+ different publicly available [lists](https://github.com/stamparm/maltrail) of suspicious and/or malicious IP addresses. All lists are automatically retrieved and parsed on a daily (every 24 hours) basis and the final result is pushed to this repository. The feed contains IP addresses plus an occurrence count (how many source lists each IP appears on). Higher counts generally mean higher confidence and fewer false positives when blocking inbound traffic. Also, list is sorted by occurrence count (highest to lowest).

As an example, to get a fresh and ready-to-deploy auto-ban list of "bad IPs" that appear on at least 3 (black)lists you can run:

```
curl -fsSL https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt 2>/dev/null | grep -v "^#" | grep -Ev '[[:space:]]([12])$' | cut -f 1
```

If you want to try it with `ipset`, you can do the following:

```
sudo -i
apt-get update && apt-get install -y iptables ipset
ipset -q flush ipsum
ipset -q create ipsum hash:ip
for ip in $(curl https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt 2>/dev/null | grep -v "#" | grep -Ev '[[:space:]]([12])$' | cut -f 1); do ipset add ipsum $ip; done
iptables -D INPUT -m set --match-set ipsum src -j DROP 2>/dev/null
iptables -I INPUT -m set --match-set ipsum src -j DROP
```

In directory [levels](levels) you can find preprocessed raw IP lists based on number of blacklist occurrences (e.g. [levels/3.txt](levels/3.txt) holds IP addresses that can be found on 3 or more blacklists).

Wall of Shame (2026-03-30)
----

|IP|DNS lookup|Number of (black)lists|
|---|---|--:|
2.57.121.112|dns112.personaliseplus.com|11
2.57.121.25|hosting25.tronicsat.com|10
91.224.92.50|imize2.writeresaychooseboltsnow.com|9
185.156.73.233|-|9
2.57.122.190|-|8
14.53.61.63|-|8
71.6.146.186|inspire.census.shodan.io|8
74.48.16.46|-|8
80.82.77.33|sky.census.shodan.io|8
114.111.54.188|-|8
185.91.69.217|-|8
195.178.110.15|-|8
213.112.126.21|c-213-112-126-21.bbcust.telenor.se|8
2.27.53.96|-|7
2.57.121.17|hosting17.tronicsat.com|7
2.57.121.69|mta69.soniideas.com|7
2.57.122.192|-|7
2.57.122.195|-|7
2.57.122.197|-|7
2.57.122.199|-|7
2.57.122.238|-|7
5.101.64.6|scan.f6.security|7
8.154.6.154|-|7
12.156.67.18|-|7
14.29.198.130|-|7
14.63.196.175|-|7
14.63.217.28|-|7
14.225.18.22|static.vnpt.vn|7
18.116.101.220|scan.visionheight.com|7
36.64.162.195|-|7
36.91.166.34|-|7
37.120.213.13|-|7
45.148.10.121|-|7
45.148.10.141|-|7
60.199.224.2|60-199-224-2.static.tfn.net.tw|7
62.3.58.42|659814.myvds.top|7
62.193.106.227|-|7
66.132.172.132|132.172.132.66.censys-scanner.com|7
66.132.195.99|99.195.132.66.censys-scanner.com|7
66.132.195.106|106.195.132.66.censys-scanner.com|7
71.6.135.131|soda.census.shodan.io|7
71.6.165.200|census12.shodan.io|7
80.82.77.139|dojo.census.shodan.io|7
80.253.31.232|-|7
81.192.46.36|adsl-36-46-192-81.adsl.iam.net.ma|7
81.211.72.167|-|7
82.24.64.32|-|7
85.18.236.229|85-18-236-229.ip.fastwebnet.it|7
86.54.31.38|blue2.census.shodan.io|7
86.54.31.42|green.census.shodan.io|7
87.251.64.141|-|7
92.118.39.76|-|7
92.118.39.95|-|7
92.205.56.196|196.56.205.92.host.secureserver.net|7
92.205.57.72|72.57.205.92.host.secureserver.net|7
92.207.4.157|-|7
95.58.255.251|95.58.255.251.static.telecom.kz|7
95.167.225.76|-|7
101.47.158.137|-|7
103.120.227.88|-|7
103.143.10.79|-|7
104.168.56.24|104-168-56-24-host.colocrossing.com|7
118.70.178.158|-|7
121.165.204.105|-|7
124.243.170.62|ecs-124-243-170-62.compute.hwclouds-dns.com|7
125.21.59.218|-|7
138.204.127.54|-|7
139.59.112.10|-|7
148.135.17.10|paringonly.com|7
163.7.1.156|-|7
163.7.8.88|-|7
167.94.146.57|57.146.94.167.censys-scanner.com|7
168.167.228.74|-|7
171.213.135.78|-|7
171.243.151.30|dynamic-adsl.viettel.vn|7
171.244.37.96|-|7
175.107.32.186|-|7
176.12.76.109|dimokavip777.hlab.kz|7
176.120.22.17|-|7
177.229.197.38|customer-MCA-TGZ-197-38.megared.net.mx|7
188.128.75.50|-|7
193.24.211.93|-|7
193.32.162.145|-|7
197.5.145.73|-|7
213.209.159.158|-|7
213.209.159.159|-|7
218.145.181.48|-|7
220.80.223.144|-|7
220.81.148.22|-|7
220.178.8.154|-|7
222.99.15.195|-|7
223.197.186.7|223-197-186-7.static.imsbiz.com|7
