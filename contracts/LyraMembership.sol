// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title LyraMembership
/// @notice Cobra la membresía y la recarga en USDC. Suelta Órbita al momento y aparta el 10% mensual.
/// @dev El alta con correo, Google o Apple no vive aquí. Mercado Pago tampoco: ese pago lo acredita la app.
contract LyraMembership {
    uint256 public constant GLOBAL_BPS = 1000;
    uint8 public constant STARTED = 1;
    uint8 public constant NEGOCIO = 2;
    uint8 public constant PRO = 3;

    address public immutable usdc;
    address public treasury;
    address public owner;

    struct Account {
        address sponsor;
        uint8 packageId;
        uint64 renewedMonth;
    }

    mapping(address => Account) public accounts;
    mapping(uint256 => uint256) public monthPool;
    mapping(uint256 => address[]) private monthQualifiers;
    mapping(uint256 => bool) public monthSettled;

    event Purchased(address indexed buyer, uint8 packageId, uint256 amount, bool renewal);
    event OrbitPaid(address indexed buyer, address indexed sponsor, uint8 level, uint256 amount);
    event MonthSettled(uint256 month, uint256 pool, uint256 shares);

    error NotOwner();
    error BadPackage();
    error AlreadyMember();
    error NotMember();
    error SelfSponsor();
    error MonthOpen();
    error MonthAlreadySettled();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address usdc_, address treasury_) {
        if (usdc_ == address(0) || treasury_ == address(0)) revert NotOwner();
        usdc = usdc_;
        treasury = treasury_;
        owner = msg.sender;
    }

    function setTreasury(address next) external onlyOwner {
        if (next == address(0)) revert NotOwner();
        treasury = next;
    }

    function qualifierCount(uint256 month) external view returns (uint256) {
        return monthQualifiers[month].length;
    }

    /// @notice Inicio $29, Negocio $99, Pro $249. El patrocinador puede ser la dirección cero.
    function buy(uint8 packageId, address sponsor) external {
        if (packageId < STARTED || packageId > PRO) revert BadPackage();
        if (accounts[msg.sender].packageId != 0) revert AlreadyMember();
        if (sponsor == msg.sender) revert SelfSponsor();
        accounts[msg.sender] = Account({ sponsor: sponsor, packageId: packageId, renewedMonth: 0 });
        _collect(msg.sender, priceOf(packageId), packageId, false);
    }

    /// @notice Recarga del paquete que ya tiene. El Pro que renueva entra al reparto del 10% de ese mes.
    function renew() external {
        uint8 packageId = accounts[msg.sender].packageId;
        if (packageId == 0) revert NotMember();
        uint256 month = calendarMonth(block.timestamp);
        if (packageId == PRO && accounts[msg.sender].renewedMonth != uint64(month)) {
            monthQualifiers[month].push(msg.sender);
        }
        accounts[msg.sender].renewedMonth = uint64(month);
        _collect(msg.sender, rebuyOf(packageId), packageId, true);
    }

    /// @notice Reparte el 10% del mes ya cerrado, en partes iguales, entre los Pro que renovaron.
    function settleMonth(uint256 month) external {
        if (month >= calendarMonth(block.timestamp)) revert MonthOpen();
        if (monthSettled[month]) revert MonthAlreadySettled();
        monthSettled[month] = true;
        uint256 pool = monthPool[month];
        address[] memory list = monthQualifiers[month];
        emit MonthSettled(month, pool, list.length);
        if (pool == 0) return;
        if (list.length == 0) {
            require(IERC20(usdc).transfer(treasury, pool), "treasury");
            return;
        }
        uint256 share = pool / list.length;
        uint256 dust = pool - share * list.length;
        for (uint256 index = 0; index < list.length; index++) {
            if (share > 0) require(IERC20(usdc).transfer(list[index], share), "share");
        }
        if (dust > 0) require(IERC20(usdc).transfer(treasury, dust), "dust");
    }

    function priceOf(uint8 packageId) public pure returns (uint256) {
        if (packageId == STARTED) return 29_000000;
        if (packageId == NEGOCIO) return 99_000000;
        if (packageId == PRO) return 249_000000;
        revert BadPackage();
    }

    function rebuyOf(uint8 packageId) public pure returns (uint256) {
        if (packageId == STARTED) return 19_000000;
        if (packageId == NEGOCIO) return 49_000000;
        if (packageId == PRO) return 99_000000;
        revert BadPackage();
    }

    /// @dev Mes calendario UTC, enero = 0. Algoritmo civil de Howard Hinnant.
    function calendarMonth(uint256 timestamp) public pure returns (uint256) {
        uint256 daysSinceEpoch = timestamp / 86400;
        uint256 z = daysSinceEpoch + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        uint256 year = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        uint256 month = mp < 10 ? mp + 3 : mp - 9;
        if (month <= 2) year += 1;
        return year * 12 + (month - 1);
    }

    function _collect(address buyer, uint256 amount, uint8 packageId, bool renewal) internal {
        require(IERC20(usdc).transferFrom(buyer, address(this), amount), "usdc");
        uint256 poolCut = (amount * GLOBAL_BPS) / 10_000;
        uint256 month = calendarMonth(block.timestamp);
        monthPool[month] += poolCut;
        uint256 paid = poolCut;
        uint16[6] memory rates = [2000, 1000, 500, 500, 500, 500];
        address cursor = accounts[buyer].sponsor;
        for (uint256 level = 1; level <= 6 && cursor != address(0); level++) {
            Account memory sponsor = accounts[cursor];
            if (_depth(sponsor.packageId) >= level) {
                uint256 cut = (amount * rates[level - 1]) / 10_000;
                if (cut > 0) {
                    require(IERC20(usdc).transfer(cursor, cut), "orbit");
                    paid += cut;
                    emit OrbitPaid(buyer, cursor, uint8(level), cut);
                }
            }
            cursor = sponsor.sponsor;
        }
        uint256 rest = amount - paid;
        if (rest > 0) require(IERC20(usdc).transfer(treasury, rest), "treasury");
        emit Purchased(buyer, packageId, amount, renewal);
    }

    function _depth(uint8 packageId) internal pure returns (uint256) {
        if (packageId == STARTED) return 2;
        if (packageId == NEGOCIO) return 4;
        if (packageId == PRO) return 6;
        return 0;
    }
}
