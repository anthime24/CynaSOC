import random
import ipaddress
from fields import ids_fields
from events import ids_event
import ipsum_loader


# maps common port values to the correct protocol 
def get_port(protocol):
    # create a dictionary of common port values for protocols
    protocol_to_port = {
        'TCP': random.randint(1, 65535),
        'UDP': random.randint(1, 65535),
        'ICMP': 1,
        'HTTP': 80,
        'HTTPS': 443,
        'FTP': 21,
        'SMTP': 25,
        'DNS': 53,
        'DHCP': 67,
        'TFTP': 69,
        'SNMP': 161
    }

    # return the port for the protocol, if not protocol from above, generate random port number
    return protocol_to_port.get(protocol, random.randint(1, 65535))


# generates a random valid ip address
def get_ip():
    # generate a random octet (a number between 0 and 255)
    octet1 = random.randint(0, 255)
    octet2 = random.randint(0, 255)
    octet3 = random.randint(0, 255)
    octet4 = random.randint(0, 255)

    # create a string representation of the ip address
    ip_str = f"{octet1}.{octet2}.{octet3}.{octet4}"

    # create an ip address object using the ip_address function
    ip_addr = ipaddress.ip_address(ip_str)

    return ip_addr


# gather and generate values for fields and construct into access event class object
def make_event():
    # create the severity, protocol, flag and alert description from the possible choices based on the weights
    event_severity = random.choices(ids_fields.SEVERITY, ids_fields.SEVERITY_WEIGHTS)[0]
    event_protocol = random.choices(ids_fields.PROTOCOL, ids_fields.PROTOCOL_WEIGHTS)[0]
    event_flag = random.choices(ids_fields.FLAG, ids_fields.FLAG_WEIGHTS)[0]
    event_alert_desc = random.choices(ids_fields.ALERT_DESCRIPTION, ids_fields.ALERT_WEIGHTS)[0]

    # use the get_ip method to generate random valid ip addresses for source and destination
    # 20% du temps, utilise une IP malveillante depuis le feed ipsum à la place de Faker
    _MALICIOUS_RATIO = 0.2

    _malicious_src = ipsum_loader.get_malicious_ip() if random.random() < _MALICIOUS_RATIO else None
    event_src_ip = ipaddress.ip_address(_malicious_src) if _malicious_src is not None else get_ip()

    _malicious_dest = ipsum_loader.get_malicious_ip() if random.random() < _MALICIOUS_RATIO else None
    event_dest_ip = ipaddress.ip_address(_malicious_dest) if _malicious_dest is not None else get_ip()

    # create a random valid source port
    event_src_port = random.randint(1, 65535)
    
    # create the dest port based on the protocol, if not then generate a random valid port
    event_dest_port = get_port(event_protocol)

    # create the event using the 'Event' class and return the 'Event' object
    event = ids_event(event_severity, event_protocol, event_src_ip, event_dest_ip, event_src_port, event_dest_port, event_flag, event_alert_desc)

    return event