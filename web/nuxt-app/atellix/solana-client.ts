import { PublicKey, Keypair, Connection, Transaction, SystemProgram, clusterApiUrl } from '@solana/web3.js'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { GlowWalletAdapter } from '@solana/wallet-adapter-glow'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { AnchorProvider, Program, BN, setProvider } from '@project-serum/anchor'
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, createAssociatedTokenAccountInstruction, TokenAccountNotFoundError } from '@solana/spl-token'
import { v4 as uuidv4, parse as uuidParse } from 'uuid'
import bigintConv from 'bigint-conversion'
import { create, all } from 'mathjs'
import { DateTime } from 'luxon'
import { Buffer } from 'buffer'
import lo from 'buffer-layout'
import base32 from 'base32.js'
import bs58 from 'bs58'

const SOLANA_NETWORK = 'devnet'
const ANCHOR_IDL = {
    'aqua-dex': require('@/atellix/idl/aqua_dex.json'),
}

export default {
    init () {
        this.math = create(all, {
            number: 'BigNumber',
            precision: 64
        })
        this.program = {}
    },
    updateRegister(data) {
        this.registerFn = data
    },
    importSecretKey(keyStr) {
        var dec = new base32.Decoder({ type: "crockford" })
        var spec = dec.write(keyStr).finalize()
        return Keypair.fromSecretKey(new Uint8Array(spec))
    },
    exportSecretKey(keyPair) {
        var enc = new base32.Encoder({ type: "crockford", lc: true })
        return enc.write(keyPair.secretKey).finalize()
    },
    getWalletAdapters(network) {
        return [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter({ network }),
            new GlowWalletAdapter(),
        ]
    },
    getWallets() {
        const network = WalletAdapterNetwork.Devnet
        //console.log('Get Wallet Adapters: ' + network)
        let adapters = this.getWalletAdapters(network)
        let wallets = []
        for (var i = 0; i < adapters.length; i++) {
            let adp = adapters[i]
            //console.log(adp.name + ': ' + adp.readyState)
            if (adp.readyState === 'Installed') {
                wallets.push(adp)
                //break
            }
            //console.log(adp)
        }
        return wallets
    },
    getProvider(adapter) {
        let apiUrl = clusterApiUrl(SOLANA_NETWORK)
        let wallet = {
            publicKey: adapter.publicKey,
            signTransaction: function (transaction) { return adapter.signTransaction(transaction) },
            signAllTransactions: function (transactions) { return adapter.signAllTransactions(transactions) }
        }
        let connection = new Connection(apiUrl, { commitment: 'confirmed' })
        let provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
        this.provider = provider
        return provider
    },
    async associatedTokenAddress(walletAddress, tokenMintAddress) {
        const addr = await PublicKey.findProgramAddress(
            [walletAddress.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), tokenMintAddress.toBuffer()],
            ASSOCIATED_TOKEN_PROGRAM_ID
        )
        const res = { 'pubkey': await addr[0].toString(), 'nonce': addr[1] }
        return res
    },
    async programAddress(inputs, program) {
        const addr = await PublicKey.findProgramAddress(inputs, program)
        const res = { 'pubkey': await addr[0].toString(), 'nonce': addr[1] }
        return res
    },
    loadProgram(programKey) {
        let provider = this.provider
        setProvider(provider)
        if (typeof this.program[programKey] === 'undefined') {
            let programPK = new PublicKey(ANCHOR_IDL[programKey]['metadata']['address'])
            this.program[programKey] = new Program(ANCHOR_IDL[programKey], programPK)
        }
    },
    async getAccountData(programKey, accountType, accountPK) {
        let provider = this.provider
        setProvider(provider)
        let program
        if (typeof this.program[programKey] === 'undefined') {
            program = this.program[programKey]
        } else {
            let programPK = new PublicKey(ANCHOR_IDL[programKey]['metadata']['address'])
            program = new Program(ANCHOR_IDL[programKey], programPK)
            this.program[programKey] = program
        }
        let data = await program.account[accountType].fetch(accountPK)
        return data
    },
    async getAccountInfo(accountPK) {
        let provider = this.provider
        setProvider(provider)
        return await provider.connection.getAccountInfo(accountPK)
    },
    async getLamports(wallet) {
        let walletPK = new PublicKey(wallet)
        let walletInfo = await this.provider.connection.getAccountInfo(walletPK, 'confirmed')
        if (walletInfo && typeof walletInfo['lamports'] !== 'undefined') {
            return walletInfo.lamports
        }
        return Number(0)
    },
    async getTokenBalance(mintPK, walletPK) {
        //console.log(mint, wallet)
        //let mintPK = new PublicKey(mint)
        //console.log('mintPK')
        //console.log(mintPK.toBase58())
        //let walletPK = new PublicKey(wallet)
        //console.log('walletPK')
        //console.log(walletPK.toBase58())
        let tokenInfo = await this.associatedTokenAddress(walletPK, mintPK)
        let tokenPK = new PublicKey(tokenInfo.pubkey)
        let amount = '0'
        try {
            let tokenAccount = await getAccount(this.provider.connection, tokenPK)
            //console.log('Token Account - Wallet: ' + wallet + ' Mint: ' + mint)
            //console.log(tokenAccount)
            amount = tokenAccount.amount.toString()
        } catch (error) {
            if (error instanceof TokenAccountNotFoundError) {
                // Do nothing
            } else {
                console.error(error)
            }
        }
        return amount
    },
    async hasTokenAccount(ataPK) {
        try {
            await getAccount(this.provider.connection, ataPK)
        } catch (error) {
            return false
        }
        return true
    },
// Orderbook Decoding
    encodeOrderId(orderIdBuf) {
        const enc = new base32.Encoder({ type: "crockford", lc: true })
        var zflist = orderIdBuf.toJSON().data
        var zflen = 16 - zflist.length
        if (zflen > 0) {
            var zfprefix = Array(zflen).fill(0)
            zflist = zfprefix.concat(zflist)
        }
        zflist.reverse()
        return enc.write(new Uint8Array(zflist)).finalize()
    },
    decodeOrderId(orderId) {
        var dec = new base32.Decoder({ type: "crockford" })
        var spec = dec.write(orderId).finalize()
        var arr = new Uint8Array(spec)
        var arrhex = [...arr].map(x => x.toString(16).padStart(2, '0')).join('')
        var bgn = BigInt('0x' + arrhex)
        return new BN(bgn.toString())
    },
    decodeOrderNode(tag, blob) {
        var data
        if (tag === 0) {
            data = null
        } else if (tag === 1) {
            const stInnerNode = lo.struct([
                lo.u32('tag'),
                lo.blob(16, 'key'),
                lo.u32('prefix_len'),
                lo.seq(lo.u32(), 2, 'children'),
                lo.blob(24),
            ])
            data = stInnerNode.decode(blob)
        } else if (tag === 2) {
            const stLeafNode = lo.struct([
                lo.u32('tag'),
                lo.u32('slot'),
                lo.blob(16, 'key'),
                lo.blob(32, 'owner'),
            ])
            const stPrice = lo.struct([
                lo.blob(8),
                lo.nu64('price'),
            ])
            data = stLeafNode.decode(blob)
            //data['price'] = bigintConv.bufToBigint(data['key']) >> BigInt(64)
            data['price'] = stPrice.decode(data['key'])['price']
            data['key'] = this.encodeOrderId(data['key'])
            data['owner'] = (new PublicKey(data['owner'].toJSON().data)).toString()
        } else if (tag === 3 || tag === 4) {
            const stFreeNode = lo.struct([
                lo.u32('tag'),
                lo.u32('next'),
                lo.blob(48),
            ])
            data = stFreeNode.decode(blob)
        }
        return data
    },
    decodeOrdersMap(pageTableEntry, pages) {
        const headerSize = pageTableEntry['header_size']
        const offsetSize = pageTableEntry['offset_size']
        const stNode = lo.struct([
            lo.u32('tag'),
            lo.blob(52)
        ])
        const instPerPage = Math.floor((16384 - (headerSize + offsetSize)) / stNode.span)
        const stSlabVec = lo.struct([
            lo.blob(offsetSize),
            lo.nu64('bump_index'),
            lo.nu64('free_list_len'),
            lo.u32('free_list_head'),
            lo.u32('root_node'),
            lo.nu64('leaf_count'),
            lo.seq(lo.blob(stNode.span), instPerPage, 'nodes'),
        ])
        var totalPages = Math.floor(pageTableEntry['alloc_items'] / instPerPage)
        if ((pageTableEntry['alloc_items'] % instPerPage) !== 0) {
            totalPages = totalPages + 1
        }
        var mapPages = []
        for (var p = 0; p < totalPages; p++) {
            var pidx = pageTableEntry['alloc_pages'][p]
            mapPages.push(pages[pidx])
        }
        var nodeSpec = {
            'nodes': [],
        }
        for (var i = 0; i < mapPages.length; i++) {
            var res = stSlabVec.decode(mapPages[i])
            if (i === 0) {
                nodeSpec['bump_index'] = res['bump_index']
                nodeSpec['free_list_len'] = res['free_list_len']
                nodeSpec['free_list_head'] = res['free_list_head']
                nodeSpec['root_node'] = res['root_node']
                nodeSpec['leaf_count'] = res['leaf_count']
            }
            for (var nodeIdx = 0; nodeIdx < res['nodes'].length; nodeIdx++) {
                var nodeBlob = res['nodes'][nodeIdx]
                var nodeTag = stNode.decode(nodeBlob)
                nodeSpec['nodes'].push(this.decodeOrderNode(nodeTag['tag'], nodeBlob))
                if (nodeSpec['nodes'].length === pageTableEntry['alloc_items']) {
                    i = mapPages.length
                    break
                }
            }
        }
        return nodeSpec
    },
    decodeOrdersVec(pageTableEntry, pages) {
        const headerSize = pageTableEntry['header_size']
        const offsetSize = pageTableEntry['offset_size']
        const stOrder = lo.struct([
            lo.nu64('amount'),
            lo.ns64('expiry'),
        ])
        const instPerPage = Math.floor((16384 - (headerSize + offsetSize)) / stOrder.span)
        const stSlabVec = lo.struct([
            lo.blob(offsetSize),
            lo.u32('free_top'),
            lo.u32('next_index'),
            lo.seq(stOrder, instPerPage, 'orders'),
        ])
        var totalPages = Math.floor(pageTableEntry['alloc_items'] / instPerPage)
        if ((pageTableEntry['alloc_items'] % instPerPage) !== 0) {
            totalPages = totalPages + 1
        }
        var vecPages = []
        for (var p = 0; p < totalPages; p++) {
            var pidx = pageTableEntry['alloc_pages'][p]
            vecPages.push(pages[pidx])
        }
        var orderSpec = {
            'orders': [],
        }
        for (var i = 0; i < vecPages.length; i++) {
            var res = stSlabVec.decode(vecPages[i])
            if (i === 0) {
                orderSpec['free_top'] = res['free_top']
                orderSpec['next_index'] = res['next_index']
            }
            for (var orderIdx = 0; orderIdx < res['orders'].length; orderIdx++) {
                orderSpec['orders'].push(res['orders'][orderIdx])
                if (orderSpec['orders'].length === pageTableEntry['alloc_items']) {
                    i = vecPages.length
                    break
                }
            }
        }
        return orderSpec
    },
    decodeOrderBookSide(side, mapData, vecData) {
        var orderBook = []
        for (var i = 0; i < mapData['nodes'].length; i++) {
            var node = mapData['nodes'][i]
            //console.log(side, node)
            if (node && node.tag === 2) {
                var order = vecData['orders'][node.slot]
                var orderItem = {
                    'type': side,
                    'key': node['key'],
                    'price': node['price'],
                    'owner': node['owner'],
                    'amount': order['amount'],
                    'expiry': order['expiry'],
                }
                orderBook.push(orderItem)
            }
        }
        return orderBook
    },
    decodeOrderBook(data) {
        const stTypedPage = lo.struct([
            lo.nu64('header_size'),
            lo.nu64('offset_size'),
            lo.nu64('alloc_items'),
            lo.seq(lo.u16('page_index'), 128, 'alloc_pages'), // TYPE_MAX_PAGES
        ]);
        const stSlabAlloc = lo.struct([
            lo.u16('top_unused_page'),
            lo.seq(stTypedPage, 16, 'type_page'), // TYPE_MAX
            lo.seq(lo.blob(16384), 4, 'pages'), // PAGE_SIZE
        ]);
        var res = stSlabAlloc.decode(data)
        //console.log(JSON.stringify(res['type_page']))
        var bidMap = res['type_page'][0]
        var askMap = res['type_page'][1]
        var bidVec = res['type_page'][2]
        var askVec = res['type_page'][3]

        var bidVecData = this.decodeOrdersVec(bidVec, res['pages'])
        var askVecData = this.decodeOrdersVec(askVec, res['pages'])
        var bidMapData = this.decodeOrdersMap(bidMap, res['pages'])
        var askMapData = this.decodeOrdersMap(askMap, res['pages'])
        var bids = this.decodeOrderBookSide('bid', bidMapData, bidVecData)
        var asks = this.decodeOrderBookSide('ask', askMapData, askVecData)
        asks.sort(function(a, b) {
            return a.key.localeCompare(b.key)
        })
        bids.sort(function(a, b) {
            return b.key.localeCompare(a.key)
        })
        return {
            'bids': bids,
            'asks': asks,
        }
    },
    decodeSettlementNode(tag, blob) {
        var data
        if (tag === 0) {
            data = null
        } else if (tag === 1) {
            const stInnerNode = lo.struct([
                lo.u32('tag'),
                lo.blob(16, 'key'),
                lo.u32('prefix_len'),
                lo.seq(lo.u32(), 2, 'children'),
                lo.blob(24),
            ])
            data = stInnerNode.decode(blob)
        } else if (tag === 2) {
            const stLeafNode = lo.struct([
                lo.u32('tag'),
                lo.u32('slot'),
                lo.blob(16, 'key'),
                lo.blob(32, 'owner'),
            ])
            data = stLeafNode.decode(blob)
            data['owner'] = (new PublicKey(data['owner'].toJSON().data)).toString()
        } else if (tag === 3 || tag === 4) {
            const stFreeNode = lo.struct([
                lo.u32('tag'),
                lo.u32('next'),
                lo.blob(48),
            ])
            data = stFreeNode.decode(blob)
        }
        return data
    },
    decodeSettlementMap(pageTableEntry, pages) {
        const headerSize = pageTableEntry['header_size']
        const offsetSize = pageTableEntry['offset_size']
        const stNode = lo.struct([
            lo.u32('tag'),
            lo.blob(52)
        ])
        const instPerPage = Math.floor((16384 - (headerSize + offsetSize)) / stNode.span)
        const stSlabVec = lo.struct([
            lo.blob(offsetSize),
            lo.nu64('bump_index'),
            lo.nu64('free_list_len'),
            lo.u32('free_list_head'),
            lo.u32('root_node'),
            lo.nu64('leaf_count'),
            lo.seq(lo.blob(stNode.span), instPerPage, 'nodes'),
        ])
        var totalPages = Math.floor(pageTableEntry['alloc_items'] / instPerPage)
        if ((pageTableEntry['alloc_items'] % instPerPage) !== 0) {
            totalPages = totalPages + 1
        }
        var mapPages = []
        for (var p = 0; p < totalPages; p++) {
            var pidx = pageTableEntry['alloc_pages'][p]
            mapPages.push(pages[pidx])
        }
        var nodeSpec = {
            'nodes': [],
        }
        for (var i = 0; i < mapPages.length; i++) {
            var res = stSlabVec.decode(mapPages[i])
            if (i === 0) {
                nodeSpec['bump_index'] = res['bump_index']
                nodeSpec['free_list_len'] = res['free_list_len']
                nodeSpec['free_list_head'] = res['free_list_head']
                nodeSpec['root_node'] = res['root_node']
                nodeSpec['leaf_count'] = res['leaf_count']
            }
            for (var nodeIdx = 0; nodeIdx < res['nodes'].length; nodeIdx++) {
                var nodeBlob = res['nodes'][nodeIdx]
                var nodeTag = stNode.decode(nodeBlob)
                nodeSpec['nodes'].push(this.decodeSettlementNode(nodeTag['tag'], nodeBlob))
                if (nodeSpec['nodes'].length === pageTableEntry['alloc_items']) {
                    i = mapPages.length
                    break
                }
            }
        }
        return nodeSpec
    },
    decodeSettlementVec(pageTableEntry, pages) {
        const headerSize = pageTableEntry['header_size']
        const offsetSize = pageTableEntry['offset_size']
        const stEntry = lo.struct([
            lo.nu64('mkt_token_balance'),
            lo.ns64('prc_token_balance'),
        ])
        const instPerPage = Math.floor((16384 - (headerSize + offsetSize)) / stEntry.span)
        const stSlabVec = lo.struct([
            lo.blob(offsetSize),
            lo.u32('free_top'),
            lo.u32('next_index'),
            lo.seq(stEntry, instPerPage, 'entries'),
        ])
        var totalPages = Math.floor(pageTableEntry['alloc_items'] / instPerPage)
        if ((pageTableEntry['alloc_items'] % instPerPage) !== 0) {
            totalPages = totalPages + 1
        }
        var vecPages = []
        for (var p = 0; p < totalPages; p++) {
            var pidx = pageTableEntry['alloc_pages'][p]
            vecPages.push(pages[pidx])
        }
        var entrySpec = {
            'entries': [],
        }
        for (var i = 0; i < vecPages.length; i++) {
            var res = stSlabVec.decode(vecPages[i])
            if (i === 0) {
                entrySpec['free_top'] = res['free_top']
                entrySpec['next_index'] = res['next_index']
            }
            for (var entryIdx = 0; entryIdx < res['entries'].length; entryIdx++) {
                entrySpec['entries'].push(res['entries'][entryIdx])
                if (entrySpec['entries'].length === pageTableEntry['alloc_items']) {
                    i = vecPages.length
                    break
                }
            }
        }
        return entrySpec
    },
    decodeSettlementLog(data, walletPK = null) {
        const stAccountsHeader = lo.struct([
            lo.blob(32, 'market'),
            lo.blob(32, 'prev'),
            lo.blob(32, 'next'),
            lo.u32('items'),
        ]);
        const stTypedPage = lo.struct([
            lo.nu64('header_size'),
            lo.nu64('offset_size'),
            lo.nu64('alloc_items'),
            lo.seq(lo.u16('page_index'), 128, 'alloc_pages'), // TYPE_MAX_PAGES
        ]);
        const stSlabAlloc = lo.struct([
            lo.seq(stAccountsHeader, 1, 'header'),
            lo.u16('top_unused_page'),
            lo.seq(stTypedPage, 16, 'type_page'), // TYPE_MAX
            lo.seq(lo.blob(16384), 6, 'pages'), // PAGE_SIZE
        ]);
        var res = stSlabAlloc.decode(data)
        var header = res['header']
        var marketPK = header[0]['market'].toJSON().data
        var prevPK = header[0]['prev'].toJSON().data
        var nextPK = header[0]['next'].toJSON().data
        var result = {
            'header': {
                'market': (new PublicKey(marketPK)).toString(),
                'prev': (new PublicKey(prevPK)).toString(),
                'next': (new PublicKey(nextPK)).toString(),
                'items': header[0]['items'],
            }
        }
        var settleMap = res['type_page'][0]
        var settleVec = res['type_page'][1]
        var mapData = this.decodeSettlementMap(settleMap, res['pages'])
        var vecData = this.decodeSettlementVec(settleVec, res['pages'])
        var settlementEntries = []
        var userWallet = null
        if (walletPK) {
            userWallet = walletPK.toString()
        }
        for (var i = 0; i < mapData['nodes'].length; i++) {
            var node = mapData['nodes'][i]
            if (node && node.tag === 2) {
                var entry = vecData['entries'][node.slot]
                if ((!userWallet) || (userWallet && userWallet === node['owner'])) {
                    var entryItem = {
                        'owner': node['owner'],
                        'mkt_token_balance': entry['mkt_token_balance'],
                        'prc_token_balance': entry['prc_token_balance'],
                    }
                    settlementEntries.push(entryItem)
                }
            }
        }
        result['entries'] = settlementEntries
        return result
    },
    async sendOrder(marketAccounts, orderSpec) {
        var accounts = {
            'splTokenProg': TOKEN_PROGRAM_ID,
        }
        var accountList = [
            'market', 'state', 'agent', 'user', 'userMktToken', 'userPrcToken', 'mktVault', 'prcVault', 'orders', 'settleA', 'settleB',
        ]
        for (var i = 0; i < accountList.length; i++) {
            accounts[accountList[i]] = marketAccounts[accountList[i]]
        }
        accounts['result'] = accounts['user']
        const operationSpec = {
            'accounts': accounts,
        }
        //console.log(operationSpec)
        var tx = new Transaction()
        if (orderSpec['orderType'] === 'bid') {
            if (orderSpec['matchType'] === 'limit') {
                tx.add(this.program['aqua-dex'].instruction.limitBid(
                    new BN(orderSpec['quantity']),
                    new BN(orderSpec['price']),
                    orderSpec['postOrder'],
                    orderSpec['fillOrder'],
                    new BN(0), // Expires
                    false,     // Rollover
                    operationSpec,
                ))
            } else if (orderSpec['matchType'] === 'market') {
                if (orderSpec['byQuantity']) {
                    orderSpec['netPrice'] = 0
                } else {
                    orderSpec['quantity'] = 0
                }
                tx.add(this.program['aqua-dex'].instruction.marketBid(
                    orderSpec['byQuantity'],
                    new BN(orderSpec['quantity']),
                    new BN(orderSpec['netPrice']),
                    orderSpec['fillOrder'],
                    false,  // Rollover
                    operationSpec,
                ))
            }
        } else if (orderSpec['orderType'] === 'ask') {
            if (orderSpec['matchType'] === 'limit') {
                tx.add(this.program['aqua-dex'].instruction.limitAsk(
                    new BN(orderSpec['quantity']),
                    new BN(orderSpec['price']),
                    orderSpec['postOrder'],
                    orderSpec['fillOrder'],
                    new BN(0), // Expires
                    false,     // Rollover
                    operationSpec,
                ))
            } else if (orderSpec['matchType'] === 'market') {
                if (orderSpec['byQuantity']) {
                    orderSpec['netPrice'] = 0
                } else {
                    orderSpec['quantity'] = 0
                }
                tx.add(this.program['aqua-dex'].instruction.marketAsk(
                    orderSpec['byQuantity'],
                    new BN(orderSpec['quantity']),
                    new BN(orderSpec['netPrice']),
                    orderSpec['fillOrder'],
                    false,  // Rollover
                    operationSpec,
                ))
            }
        }
        console.log('Sending transaction')
        this.provider.opts['skipPreflight'] = true
        return await this.provider.sendAndConfirm(tx)
    },
    async cancelOrder(marketAccounts, orderSpec) {
        var accounts = {
            'splTokenProg': TOKEN_PROGRAM_ID,
        }
        var accountList = [
            'market', 'state', 'agent', 'user', 'userMktToken', 'userPrcToken', 'mktVault', 'prcVault', 'orders', 'settleA', 'settleB',
        ]
        for (var i = 0; i < accountList.length; i++) {
            accounts[accountList[i]] = marketAccounts[accountList[i]]
        }
        accounts['owner'] = accounts['user']
        accounts['result'] = accounts['user']
        delete accounts['user']
        const operationSpec = {
            'accounts': accounts,
        }
        //console.log(operationSpec)
        var tx = new Transaction()
        var side
        if (orderSpec['orderType'] === 'bid') {
            side = 0
        } else if (orderSpec['orderType'] === 'ask') {
            side = 1
        }
        var orderId = this.decodeOrderId(orderSpec['orderId'])
        tx.add(this.program['aqua-dex'].instruction.cancelOrder(
            side,
            orderId,
            operationSpec
        ))
        console.log('Sending transaction')
        this.provider.opts['skipPreflight'] = true
        return await this.provider.sendAndConfirm(tx)
    },
}
