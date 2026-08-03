// divyadrishti-adv-helper.c
// Minimal native helper: opens the Linux Bluetooth MGMT control socket
// directly and issues the legacy MGMT_OP_ADD_ADVERTISING (0x003e) command,
// bypassing bluetoothd's broken extended-advertising D-Bus path entirely.
// GATT/characteristics stay in the existing Python service — untouched.
//
// Usage: divyadrishti-adv-helper add   -> adds instance 1, blocks until Ctrl-C, removes on exit
//        divyadrishti-adv-helper remove -> removes instance 1 and exits

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>
#include <errno.h>
#include <signal.h>
#include <sys/socket.h>

#ifndef AF_BLUETOOTH
#define AF_BLUETOOTH 31
#endif
#define BTPROTO_HCI 1
#define HCI_CHANNEL_CONTROL 3
#define HCI_DEV_NONE 0xffff

#define MGMT_OP_ADD_ADVERTISING     0x003e
#define MGMT_OP_REMOVE_ADVERTISING  0x003f
#define MGMT_EV_CMD_COMPLETE        0x0001
#define MGMT_EV_CMD_STATUS          0x0002

#define MGMT_ADV_FLAG_CONNECTABLE   (1u << 0)
#define MGMT_ADV_FLAG_DISCOV        (1u << 1)

// Controller index. Pi Zero W's onboard BCM43438 is the only adapter (hci0).
#define HCI_INDEX 0

struct sockaddr_hci {
    uint16_t hci_family;
    uint16_t hci_dev;
    uint16_t hci_channel;
};

#pragma pack(push, 1)
struct mgmt_hdr {
    uint16_t opcode;
    uint16_t index;
    uint16_t len;
};
struct mgmt_cp_add_advertising {
    uint8_t  instance;
    uint32_t flags;
    uint16_t duration;
    uint16_t timeout;
    uint8_t  adv_data_len;
    uint8_t  scan_rsp_len;
    uint8_t  data[31];
};
struct mgmt_cp_remove_advertising {
    uint8_t instance;
};
#pragma pack(pop)

static int mgmt_sock = -1;

static int open_mgmt(void) {
    int fd = socket(AF_BLUETOOTH, SOCK_RAW, BTPROTO_HCI);
    if (fd < 0) { perror("socket"); return -1; }
    struct sockaddr_hci addr = {0};
    addr.hci_family  = AF_BLUETOOTH;
    addr.hci_dev     = HCI_DEV_NONE;
    addr.hci_channel = HCI_CHANNEL_CONTROL;
    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind (need root / CAP_NET_ADMIN)");
        close(fd);
        return -1;
    }
    return fd;
}

// Reads mgmt events until it sees Command Complete/Status for `opcode`,
// prints the status byte, returns 0 on MGMT success (status==0x00).
static int wait_for_result(int fd, uint16_t opcode) {
    uint8_t buf[512];
    for (int tries = 0; tries < 20; tries++) {
        ssize_t n = read(fd, buf, sizeof(buf));
        if (n < (ssize_t)sizeof(struct mgmt_hdr)) continue;
        struct mgmt_hdr *hdr = (struct mgmt_hdr *)buf;
        uint8_t *body = buf + sizeof(struct mgmt_hdr);
        if (hdr->opcode == MGMT_EV_CMD_COMPLETE) {
            uint16_t comp_opcode = body[0] | (body[1] << 8);
            uint8_t status = body[2];
            if (comp_opcode == opcode) {
                printf("Command Complete: opcode=0x%04x status=0x%02x%s\n",
                       comp_opcode, status, status == 0 ? " (SUCCESS)" : " (FAILED)");
                return status == 0 ? 0 : -1;
            }
        } else if (hdr->opcode == MGMT_EV_CMD_STATUS) {
            uint16_t st_opcode = body[0] | (body[1] << 8);
            uint8_t status = body[2];
            if (st_opcode == opcode) {
                printf("Command Status: opcode=0x%04x status=0x%02x%s\n",
                       st_opcode, status, status == 0 ? " (pending/ok)" : " (FAILED)");
                if (status != 0) return -1;
                // Status 0 here just means "accepted", keep reading for Complete.
            }
        }
    }
    fprintf(stderr, "Timed out waiting for response to opcode 0x%04x\n", opcode);
    return -1;
}

static int send_add_advertising(int fd) {
    // AD structure: [len=0x11][type=0x07 Complete 128-bit UUID][16 UUID bytes, little-endian]
    // UUID: 5f3e0001-2a11-4b0e-9c3a-1f2e3d4c5b6a
    static const uint8_t uuid_ad[] = {
        0x11, 0x07,
        0x6a, 0x5b, 0x4c, 0x3d, 0x2e, 0x1f, 0x3a, 0x9c,
        0x0e, 0x4b, 0x11, 0x2a, 0x01, 0x00, 0x3e, 0x5f
    };

    uint8_t packet[sizeof(struct mgmt_hdr) + sizeof(struct mgmt_cp_add_advertising)];
    memset(packet, 0, sizeof(packet));

    struct mgmt_hdr *hdr = (struct mgmt_hdr *)packet;
    struct mgmt_cp_add_advertising *cp =
        (struct mgmt_cp_add_advertising *)(packet + sizeof(struct mgmt_hdr));

    cp->instance = 1;
    cp->flags = MGMT_ADV_FLAG_CONNECTABLE | MGMT_ADV_FLAG_DISCOV; // 0x00000003
    cp->duration = 0;
    cp->timeout = 0;
    cp->adv_data_len = sizeof(uuid_ad);
    cp->scan_rsp_len = 0;
    memcpy(cp->data, uuid_ad, sizeof(uuid_ad));

    uint16_t fixed_hdr_size = 11; // instance+flags+duration+timeout+adv_data_len+scan_rsp_len
    uint16_t total_param_len = fixed_hdr_size + cp->adv_data_len + cp->scan_rsp_len;

    hdr->opcode = MGMT_OP_ADD_ADVERTISING;
    hdr->index  = HCI_INDEX;
    hdr->len    = total_param_len;

    size_t send_len = sizeof(struct mgmt_hdr) + fixed_hdr_size + cp->adv_data_len + cp->scan_rsp_len;
    ssize_t written = write(fd, packet, send_len);
    if (written < 0) { perror("write add-advertising"); return -1; }

    return wait_for_result(fd, MGMT_OP_ADD_ADVERTISING);
}

static int send_remove_advertising(int fd) {
    uint8_t packet[sizeof(struct mgmt_hdr) + sizeof(struct mgmt_cp_remove_advertising)];
    struct mgmt_hdr *hdr = (struct mgmt_hdr *)packet;
    struct mgmt_cp_remove_advertising *cp =
        (struct mgmt_cp_remove_advertising *)(packet + sizeof(struct mgmt_hdr));

    cp->instance = 1;
    hdr->opcode = MGMT_OP_REMOVE_ADVERTISING;
    hdr->index  = HCI_INDEX;
    hdr->len    = sizeof(*cp);

    ssize_t written = write(fd, packet, sizeof(packet));
    if (written < 0) { perror("write remove-advertising"); return -1; }
    return wait_for_result(fd, MGMT_OP_REMOVE_ADVERTISING);
}

static void on_signal(int sig) {
    (void)sig;
    if (mgmt_sock >= 0) {
        printf("\nRemoving advertising instance 1...\n");
        send_remove_advertising(mgmt_sock);
        close(mgmt_sock);
    }
    exit(0);
}

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s [add|remove]\n", argv[0]);
        return 1;
    }

    mgmt_sock = open_mgmt();
    if (mgmt_sock < 0) return 1;

    if (strcmp(argv[1], "remove") == 0) {
        int rc = send_remove_advertising(mgmt_sock);
        close(mgmt_sock);
        return rc == 0 ? 0 : 1;
    }

    if (strcmp(argv[1], "add") == 0) {
        signal(SIGINT, on_signal);
        signal(SIGTERM, on_signal);
        int rc = send_add_advertising(mgmt_sock);
        if (rc != 0) {
            fprintf(stderr, "add-advertising failed\n");
            close(mgmt_sock);
            return 1;
        }
        printf("Advertising instance 1 active. Press Ctrl-C to stop and remove.\n");
        pause(); // block until signal
        return 0;
    }

    fprintf(stderr, "Unknown command: %s\n", argv[1]);
    close(mgmt_sock);
    return 1;
}
