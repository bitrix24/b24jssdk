import FormatterNumbers from './formatters/numbers'
import { IbanSpecification, FormatterIban } from './formatters/iban'

export const useFormatter = () => {
	const formatterNumber = FormatterNumbers.getInstance()

	// region Iban ////
	const formatterIban = FormatterIban.getInstance()

	// region addSpecification ////
	formatterIban.addSpecification(
		new IbanSpecification('AD', 24, 'F04F04A12', 'AD1200012030200359100100')
	)
	formatterIban.addSpecification(
		new IbanSpecification('AE', 23, 'F03F16', 'AE070331234567890123456')
	)
	formatterIban.addSpecification(
		new IbanSpecification('AL', 28, 'F08A16', 'AL47212110090000000235698741')
	)
	formatterIban.addSpecification(
		new IbanSpecification('AT', 20, 'F05F11', 'AT611904300234573201')
	)
	formatterIban.addSpecification(
		new IbanSpecification('AZ', 28, 'U04A20', 'AZ21NABZ00000000137010001944')
	)
	formatterIban.addSpecification(
		new IbanSpecification('BA', 20, 'F03F03F08F02', 'BA391290079401028494')
	)
	formatterIban.addSpecification(
		new IbanSpecification('BE', 16, 'F03F07F02', 'BE68539007547034')
	)
	formatterIban.addSpecification(
		new IbanSpecification('BG', 22, 'U04F04F02A08', 'BG80BNBG96611020345678')
	)
	formatterIban.addSpecification(
		new IbanSpecification('BH', 22, 'U04A14', 'BH67BMAG00001299123456')
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'BR',
			29,
			'F08F05F10U01A01',
			'BR9700360305000010009795493P1'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification('BY', 28, 'A04F04A16', 'BY13NBRB3600900000002Z00AB00')
	)
	formatterIban.addSpecification(
		new IbanSpecification('CH', 21, 'F05A12', 'CH9300762011623852957')
	)
	formatterIban.addSpecification(
		new IbanSpecification('CR', 22, 'F04F14', 'CR72012300000171549015')
	)
	formatterIban.addSpecification(
		new IbanSpecification('CY', 28, 'F03F05A16', 'CY17002001280000001200527600')
	)
	formatterIban.addSpecification(
		new IbanSpecification('CZ', 24, 'F04F06F10', 'CZ6508000000192000145399')
	)
	formatterIban.addSpecification(
		new IbanSpecification('DE', 22, 'F08F10', 'DE89370400440532013000')
	)
	formatterIban.addSpecification(
		new IbanSpecification('DK', 18, 'F04F09F01', 'DK5000400440116243')
	)
	formatterIban.addSpecification(
		new IbanSpecification('DO', 28, 'U04F20', 'DO28BAGR00000001212453611324')
	)
	formatterIban.addSpecification(
		new IbanSpecification('EE', 20, 'F02F02F11F01', 'EE382200221020145685')
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'EG',
			29,
			'F04F04F17',
			'EG800002000156789012345180002'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'ES',
			24,
			'F04F04F01F01F10',
			'ES9121000418450200051332'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification('FI', 18, 'F06F07F01', 'FI2112345600000785')
	)
	formatterIban.addSpecification(
		new IbanSpecification('FO', 18, 'F04F09F01', 'FO6264600001631634')
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'FR',
			27,
			'F05F05A11F02',
			'FR1420041010050500013M02606'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification('GB', 22, 'U04F06F08', 'GB29NWBK60161331926819')
	)
	formatterIban.addSpecification(
		new IbanSpecification('GE', 22, 'U02F16', 'GE29NB0000000101904917')
	)
	formatterIban.addSpecification(
		new IbanSpecification('GI', 23, 'U04A15', 'GI75NWBK000000007099453')
	)
	formatterIban.addSpecification(
		new IbanSpecification('GL', 18, 'F04F09F01', 'GL8964710001000206')
	)
	formatterIban.addSpecification(
		new IbanSpecification('GR', 27, 'F03F04A16', 'GR1601101250000000012300695')
	)
	formatterIban.addSpecification(
		new IbanSpecification('GT', 28, 'A04A20', 'GT82TRAJ01020000001210029690')
	)
	formatterIban.addSpecification(
		new IbanSpecification('HR', 21, 'F07F10', 'HR1210010051863000160')
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'HU',
			28,
			'F03F04F01F15F01',
			'HU42117730161111101800000000'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification('IE', 22, 'U04F06F08', 'IE29AIBK93115212345678')
	)
	formatterIban.addSpecification(
		new IbanSpecification('IL', 23, 'F03F03F13', 'IL620108000000099999999')
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'IS',
			26,
			'F04F02F06F10',
			'IS140159260076545510730339'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'IT',
			27,
			'U01F05F05A12',
			'IT60X0542811101000000123456'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification('IQ', 23, 'U04F03A12', 'IQ98NBIQ850123456789012')
	)
	formatterIban.addSpecification(
		new IbanSpecification('JO', 30, 'A04F22', 'JO15AAAA1234567890123456789012')
	)
	formatterIban.addSpecification(
		new IbanSpecification('KW', 30, 'U04A22', 'KW81CBKU0000000000001234560101')
	)
	formatterIban.addSpecification(
		new IbanSpecification('KZ', 20, 'F03A13', 'KZ86125KZT5004100100')
	)
	formatterIban.addSpecification(
		new IbanSpecification('LB', 28, 'F04A20', 'LB62099900000001001901229114')
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'LC',
			32,
			'U04F24',
			'LC07HEMM000100010012001200013015'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification('LI', 21, 'F05A12', 'LI21088100002324013AA')
	)
	formatterIban.addSpecification(
		new IbanSpecification('LT', 20, 'F05F11', 'LT121000011101001000')
	)
	formatterIban.addSpecification(
		new IbanSpecification('LU', 20, 'F03A13', 'LU280019400644750000')
	)
	formatterIban.addSpecification(
		new IbanSpecification('LV', 21, 'U04A13', 'LV80BANK0000435195001')
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'MC',
			27,
			'F05F05A11F02',
			'MC5811222000010123456789030'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification('MD', 24, 'U02A18', 'MD24AG000225100013104168')
	)
	formatterIban.addSpecification(
		new IbanSpecification('ME', 22, 'F03F13F02', 'ME25505000012345678951')
	)
	formatterIban.addSpecification(
		new IbanSpecification('MK', 19, 'F03A10F02', 'MK07250120000058984')
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'MR',
			27,
			'F05F05F11F02',
			'MR1300020001010000123456753'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'MT',
			31,
			'U04F05A18',
			'MT84MALT011000012345MTLCAST001S'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'MU',
			30,
			'U04F02F02F12F03U03',
			'MU17BOMM0101101030300200000MUR'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification('NL', 18, 'U04F10', 'NL91ABNA0417164300')
	)
	formatterIban.addSpecification(
		new IbanSpecification('NO', 15, 'F04F06F01', 'NO9386011117947')
	)
	formatterIban.addSpecification(
		new IbanSpecification('PK', 24, 'U04A16', 'PK36SCBL0000001123456702')
	)
	formatterIban.addSpecification(
		new IbanSpecification('PL', 28, 'F08F16', 'PL61109010140000071219812874')
	)
	formatterIban.addSpecification(
		new IbanSpecification('PS', 29, 'U04A21', 'PS92PALS000000000400123456702')
	)
	formatterIban.addSpecification(
		new IbanSpecification('PT', 25, 'F04F04F11F02', 'PT50000201231234567890154')
	)
	formatterIban.addSpecification(
		new IbanSpecification('QA', 29, 'U04A21', 'QA30AAAA123456789012345678901')
	)
	formatterIban.addSpecification(
		new IbanSpecification('RO', 24, 'U04A16', 'RO49AAAA1B31007593840000')
	)
	formatterIban.addSpecification(
		new IbanSpecification('RS', 22, 'F03F13F02', 'RS35260005601001611379')
	)
	formatterIban.addSpecification(
		new IbanSpecification('SA', 24, 'F02A18', 'SA0380000000608010167519')
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'SC',
			31,
			'U04F04F16U03',
			'SC18SSCB11010000000000001497USD'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification('SE', 24, 'F03F16F01', 'SE4550000000058398257466')
	)
	formatterIban.addSpecification(
		new IbanSpecification('SI', 19, 'F05F08F02', 'SI56263300012039086')
	)
	formatterIban.addSpecification(
		new IbanSpecification('SK', 24, 'F04F06F10', 'SK3112000000198742637541')
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'SM',
			27,
			'U01F05F05A12',
			'SM86U0322509800000000270100'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification('ST', 25, 'F08F11F02', 'ST68000100010051845310112')
	)
	formatterIban.addSpecification(
		new IbanSpecification('SV', 28, 'U04F20', 'SV62CENR00000000000000700025')
	)
	formatterIban.addSpecification(
		new IbanSpecification('TL', 23, 'F03F14F02', 'TL380080012345678910157')
	)
	formatterIban.addSpecification(
		new IbanSpecification('TN', 24, 'F02F03F13F02', 'TN5910006035183598478831')
	)
	formatterIban.addSpecification(
		new IbanSpecification('TR', 26, 'F05F01A16', 'TR330006100519786457841326')
	)
	formatterIban.addSpecification(
		new IbanSpecification('UA', 29, 'F25', 'UA511234567890123456789012345')
	)
	formatterIban.addSpecification(
		new IbanSpecification('VA', 22, 'F18', 'VA59001123000012345678')
	)
	formatterIban.addSpecification(
		new IbanSpecification('VG', 24, 'U04F16', 'VG96VPVG0000012345678901')
	)
	formatterIban.addSpecification(
		new IbanSpecification('XK', 20, 'F04F10F02', 'XK051212012345678906')
	)

	// The following countries are not included in the official IBAN registry but use the IBAN specification
	// Angola
	formatterIban.addSpecification(
		new IbanSpecification('AO', 25, 'F21', 'AO69123456789012345678901')
	)
	// Burkina
	formatterIban.addSpecification(
		new IbanSpecification('BF', 27, 'F23', 'BF2312345678901234567890123')
	)
	// Burundi
	formatterIban.addSpecification(
		new IbanSpecification('BI', 16, 'F12', 'BI41123456789012')
	)
	// Benin
	formatterIban.addSpecification(
		new IbanSpecification('BJ', 28, 'F24', 'BJ39123456789012345678901234')
	)
	// Ivory
	formatterIban.addSpecification(
		new IbanSpecification('CI', 28, 'U02F22', 'CI70CI1234567890123456789012')
	)
	// Cameron
	formatterIban.addSpecification(
		new IbanSpecification('CM', 27, 'F23', 'CM9012345678901234567890123')
	)
	// Cape Verde
	formatterIban.addSpecification(
		new IbanSpecification('CV', 25, 'F21', 'CV30123456789012345678901')
	)
	// Algeria
	formatterIban.addSpecification(
		new IbanSpecification('DZ', 24, 'F20', 'DZ8612345678901234567890')
	)
	// Iran
	formatterIban.addSpecification(
		new IbanSpecification('IR', 26, 'F22', 'IR861234568790123456789012')
	)
	// Madagascar
	formatterIban.addSpecification(
		new IbanSpecification('MG', 27, 'F23', 'MG1812345678901234567890123')
	)
	// Mali
	formatterIban.addSpecification(
		new IbanSpecification('ML', 28, 'U01F23', 'ML15A12345678901234567890123')
	)
	// Mozambique
	formatterIban.addSpecification(
		new IbanSpecification('MZ', 25, 'F21', 'MZ25123456789012345678901')
	)
	// Senegal
	formatterIban.addSpecification(
		new IbanSpecification('SN', 28, 'U01F23', 'SN52A12345678901234567890123')
	)

	// The following are regional and administrative French Republic subdivision IBAN specification (same structure as FR, only country code vary)
	formatterIban.addSpecification(
		new IbanSpecification(
			'GF',
			27,
			'F05F05A11F02',
			'GF121234512345123456789AB13'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'GP',
			27,
			'F05F05A11F02',
			'GP791234512345123456789AB13'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'MQ',
			27,
			'F05F05A11F02',
			'MQ221234512345123456789AB13'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'RE',
			27,
			'F05F05A11F02',
			'RE131234512345123456789AB13'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'PF',
			27,
			'F05F05A11F02',
			'PF281234512345123456789AB13'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'TF',
			27,
			'F05F05A11F02',
			'TF891234512345123456789AB13'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'YT',
			27,
			'F05F05A11F02',
			'YT021234512345123456789AB13'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'NC',
			27,
			'F05F05A11F02',
			'NC551234512345123456789AB13'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'BL',
			27,
			'F05F05A11F02',
			'BL391234512345123456789AB13'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'MF',
			27,
			'F05F05A11F02',
			'MF551234512345123456789AB13'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'PM',
			27,
			'F05F05A11F02',
			'PM071234512345123456789AB13'
		)
	)
	formatterIban.addSpecification(
		new IbanSpecification(
			'WF',
			27,
			'F05F05A11F02',
			'WF621234512345123456789AB13'
		)
	)
	// endregion ////
	// endregion ////

	return {
		formatterNumber,
		formatterIban,
	}
}
